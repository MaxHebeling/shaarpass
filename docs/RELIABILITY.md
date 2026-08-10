# RELIABILITY — Runbook operativo de ShaarPass

Guía para operar, desplegar, recuperar y diagnosticar ShaarPass. Objetivo: que cualquier
ingeniero pueda recuperar el sistema sin conocerlo previamente.

## 1. Arquitectura

- **Frontend/Backend:** Next.js 16 (App Router) + React 19 + TypeScript. Un solo repo.
- **Base de datos:** Supabase (Postgres + RLS + RPCs SECURITY DEFINER + pg_cron). Proyecto `abkzfztzavrsglowwkkw`.
- **Pagos:** Stripe Connect (destination charges). Webhook firmado en `/api/webhooks/stripe`.
- **Email:** Resend (transaccional + campañas). Webhook Svix en `/api/webhooks/resend`.
- **IA:** Anthropic (análisis de recinto, generador por prompt), Replicate (render).
- **Hosting:** Vercel (team `max-ab784c70`, proyecto `shaarpass`). Auto-deploy desde `main`.
- **Repo:** github.com/MaxHebeling/shaarpass.

### Flujos críticos de negocio
Compra de boleto (GA/asiento/abono/reventa) · check-in con QR · payout a organizadores ·
notificaciones automáticas · campañas de email.

## 2. Servicios externos y su resiliencia

| Servicio | Uso | Si cae |
|---|---|---|
| Supabase | Datos, auth, RLS | Caída total (SPOF). Ver §7. |
| Stripe | Pagos, payouts | No se puede cobrar; checkout falla con 409/502. Idempotente. |
| Resend | Emails/campañas | Emails no salen; el resto funciona (best-effort). |
| Anthropic/Replicate | IA (opcional) | Degradan con `reason:"no_key"`; el core no se ve afectado. Timeout 45s (`lib/http.ts`). |
| Upstash (opcional) | Cola edge | Fallback transparente a cola Postgres. |

Todas las llamadas HTTP externas de IA usan `fetchWithTimeout` para no colgar la request.

## 3. Deploy

- **Automático:** `git push origin main` → Vercel construye y publica.
- **CI (obligatorio):** `.github/workflows/ci.yml` corre `npm ci → typecheck → test → build` en cada push/PR. **Si falla, el commit no debe promoverse.**
- **Manual (forzar):** `vercel --prod --scope max-ab784c70` (útil si el CDN sirve caché vieja tras cambiar env vars).
- **Verificar deploy:** `vercel inspect <url> --scope max-ab784c70 | grep status` → `Ready`.

## 4. Rollback (LAST KNOWN GOOD)

Vercel conserva todos los deploys. Para volver a una versión estable **inmediatamente**:

1. Vercel → proyecto `shaarpass` → **Deployments** → localiza el último deploy `Ready` bueno.
2. Botón **⋯ → Promote to Production** (o "Rollback"). Instantáneo, sin rebuild.
3. Alternativa CLI: `vercel rollback <deployment-url> --scope max-ab784c70`.

**Identificar qué versión corre:** `GET /api/health` → campo `version` (SHA corto del commit).
**Qué cambió:** `git log --oneline <good_sha>..<bad_sha>`.

> La reversión de código NO revierte migraciones de BD. Si el problema es de esquema, ver §6/§7.

## 5. Health checks / smoke tests

- `GET /api/health` → liveness (la app responde). Para uptime monitors.
- `GET /api/ready` → readiness (verifica la base de datos). 200 = ok, 503 = degradado.
- Smoke manual tras deploy: `curl -s $APP/api/health` y `curl -s $APP/api/ready`.

## 6. Migraciones de base de datos

- Todas viven en `supabase/migrations/` (versionadas, numeradas). El repo **reproduce** el esquema de producción.
- **Nunca** modifiques el esquema de prod manualmente sin dejar el archivo de migración en el repo.
- Cambios delicados: preferir **backward-compatible** (añadir columna nullable → backfill → constraint en migración posterior). Evitar `DROP`/`NOT NULL` inmediato sobre tablas con datos.
- Antes de una migración riesgosa en prod: confirmar backup/PITR reciente (§7).

## 7. Backups y restauración (Disaster Recovery)

- **Backups:** Supabase gestiona backups automáticos y **PITR** según el plan del proyecto (verificar en Dashboard → Database → Backups). **Acción pendiente:** confirmar plan + probar un restore.
- **Restaurar:** Supabase Dashboard → Backups → restore a un punto en el tiempo, o restaurar a un proyecto nuevo y repuntar `NEXT_PUBLIC_SUPABASE_URL`.
- **Datos borrados por error:** si hay PITR, restaurar a minutos antes del borrado. Si no, recuperar del último backup.

### DR — respuestas rápidas
- **App caída:** revisar Vercel status + `/api/health`; si el deploy está roto → **rollback** (§4).
- **BD caída:** revisar Supabase status; `/api/ready` da 503. Esperar/incidente Supabase; no hay failover multi-región (SPOF).
- **Migración rompió prod:** rollback de código no basta; restaurar BD por PITR al punto previo.
- **Deploy falla:** el CI lo detiene antes; si pasó, rollback (§4).
- **API externa caída:** el core sigue; IA/emails degradan. Reintentar luego.
- **Credencial comprometida:** rotar en Vercel env + en el proveedor; redeploy.

## 8. Monitoring, error tracking y alertas (estado)

- **Hoy:** Vercel Analytics + Speed Insights + health checks. **Sin** error tracking ni alertas.
- **Pendiente (config externa):** Sentry (`SENTRY_DSN`) + uptime monitor apuntando a `/api/health` + canal de alerta. Ver `docs/ENVIRONMENT.md` y el reporte de confiabilidad.

## 9. Secretos

- Viven en **Vercel → Project → Settings → Environment Variables** (no en el repo). `.env.local` está gitignored.
- Esquema completo en `.env.example`.
- **Nunca** pegar secretos en chats, logs, frontend o commits. Si uno se expone → rotarlo.

## 10. Idempotencia (procesos que pueden repetirse)

- **Checkout:** orden por `idempotency_key`; `confirm_order_paid` idempotente.
- **Webhook Stripe:** `idempotencyKey` en intents/transfers; update atómico.
- **Check-in:** `valid → checked_in` atómico (doble-scan = 0 filas).
- **Campañas/notificaciones:** jobs con claim `pending → processing → done`.
- **Cola offline de check-in:** sincroniza contra el servidor (autoridad de conflictos).
