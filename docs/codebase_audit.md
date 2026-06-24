# Codebase Audit — ShaarPass

**Fecha:** 2026-06-24 · **Alcance:** `src/` (144 archivos TS/TSX, ~11.7k LOC)
**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres + RLS + RPCs SECURITY DEFINER) · Stripe Connect · Resend · Vercel
**Método:** 2 auditores en paralelo (ln-620 codebase + ln-624 code-quality), detección de 2 capas (patrón + confirmación de contexto). Ejecutado fuera del runtime hex-skills (no instalado); reglas aplicadas manualmente.

## Score global: **7.8 / 10** 🟢

| Categoría | Score | |
|---|---|---|
| Seguridad | 7.5 | Fundamentos sólidos; 1 injection menor + cron auth opcional |
| Build / Typecheck | 10 | `tsc --noEmit` y `next build` verdes, sin warnings |
| Dependencias | 6.5 | Funciona; `@supabase/ssr`/`stripe` muy atrás + CVE postcss moderado |
| Dead code | 9.5 | Muy limpio |
| Concurrencia | 7 | Núcleo excelente; baja por payout reventa + dedupe cola offline |
| Observabilidad | 6 | Errores manejados, sin logging estructurado ni health check |
| Lifecycle | 9 | Stripe lazy+fetch, reservas con release, holds expiran vía cron |
| Calidad de código | 8.4 | Sin god files ni N+1 en hot paths; fee math centralizada |

**Sin findings CRITICAL.** Build limpio, sin secretos hardcodeados, sin SQL injection, XSS controlado (solo `JSON.stringify(jsonLd)`), validación zod en todos los POST.

## Findings priorizados

### HIGH
1. **Payout de reventa mal atribuido / duplicable** — `app/api/webhooks/stripe/route.ts:44-55`. Tras `buy_listing`, re-consulta el payout por `listing_id`+`owed` en vez de usar el creado por la venta concreta → con relistings o PIs casi simultáneos puede pagar/emailar mal o duplicado (dinero real). **Fix:** que `buy_listing` devuelva `payout_id` y usarlo directo. (M)
2. **Cola offline de check-in: re-envío duplica auditoría** — `components/checkin/StaffCheckinApp.tsx:79-96` + `api/checkin/staff/route.ts:80`. El check-in server es idempotente (no hay doble admisión), pero `checkin_log` hace INSERT sin dedupe → reenvíos inflan auditoría y `bump_staff_activity`. **Fix:** dedupe de cola por token + `checkin_log` con `ON CONFLICT DO NOTHING`. (M)
3. **Filter injection en búsqueda de check-in** — `app/api/checkin/search/route.ts:26,36`. `q` solo limpia `%_`, no `,()` ni `.` (sintaxis de `.or()` de PostgREST). Acotado por `event_id` (sin fuga cross-event) pero manipulable. **Fix:** sanear `,().` o migrar a RPC con params tipados. (S)

### MEDIUM
4. **Cron auth opcional** — `api/cron/process-notifications` y `resale-payouts`: si `CRON_SECRET` no está seteado, el endpoint queda público (emails masivos / payouts disparables). **Fix:** exigir `CRON_SECRET` (401 si falta). (S)
5. **Falta rate-limit en checkouts** — `api/season-checkout` y `api/resale/checkout` crean PaymentIntents sin `hit_rate_limit` (el resto sí lo tiene). (S)
6. **Deps desactualizadas + CVE** — `@supabase/ssr` 0.5→0.12 (ruta crítica auth), `stripe` 17→22, `resend` 4→6, `zod` 3→4; postcss `<8.5.10` XSS moderado (transitivo). **Fix:** subir planificado + `npm audit fix`. (M)
7. **N+1 de email en sorteo de presale** — `dashboard/actions.ts:405`: `runPresaleLottery` manda 1 request a Resend por ganador. **Fix:** reusar `resend.batch.send` (ya existe en `eventChange.ts`). (S)

### LOW
8. `catch {}` vacíos sin log — `dashboard/recintos/[mapId]/page.tsx:36`, `e/[slug]/page.tsx:144`. (S)
9. Duplicación de armado de email de boletos entre checkout-free (`checkout/route.ts:237-259`) y webhook (`stripe/route.ts:102-124`) → extraer `sendOrderTicketsEmail(db, orderId)`. (M)
10. Tarifas Stripe/Eventbrite como magic numbers en `switch` de `feeMath.ts:13-25,77` → `STRIPE_RATES` const con fecha. (S)
11. Queries independientes del dashboard de evento en serie (`eventos/[id]/page.tsx`) → envolver en `Promise.all`. (M)
12. Extraer `detectAttendanceChanges()` puro de `updateEventDetails` (testeable). (S)
13. Sin logging estructurado / health check para una plataforma de pagos LIVE. (M)

## Fortalezas confirmadas
- Idempotencia: orden por `idempotency_key`, `confirm_order_paid` idempotente, update atómico `valid→checked_in`, reservas atómicas vía RPC.
- Stripe: `getStripe()` lazy + `createFetchHttpClient()` + `idempotencyKey` en intents/transfers.
- Fee math centralizada (`feeMath.ts`): cliente y servidor llaman la **misma** `ourFeeCents` → sin drift.
- RLS: admin client solo tras validar token de staff o `auth.getUser()`; públicas con anon; SECURITY DEFINER con revokes de anon.
- Sin god files (>1000), sin N+1 en hot paths (queries batcheadas con `.in()` + Map), guard clauses consistentes, firmas tipadas con options-object.

## Plan de acción sugerido (orden)
1. `CRON_SECRET` obligatorio (#4) — S, cierra superficie pública.
2. Sanear búsqueda de check-in (#3) — S.
3. Rate-limit en season/resale checkout (#5) — S.
4. Atar payout de reventa a la venta (#1) — M, dinero real.
5. Dedupe cola offline + `checkin_log` idempotente (#2) — M.
6. Lote de email en presale lottery (#7) + extraer `sendOrderTicketsEmail` (#9) — S/M.
7. Subir deps críticas + `npm audit fix` (#6) — M.
