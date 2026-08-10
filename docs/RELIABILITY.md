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
- `GET /api/debug/error` → **prueba de la cadena de observabilidad**. Protegida con `CRON_SECRET`;
  sin la cabecera correcta responde 404 (no anuncia que existe). Dos modos:
  - `?mode=capture` (default): captura un error y **devuelve el `errorId`**. Busca ese id en Sentry
    y en los logs de Vercel: deben coincidir. Verifica el transporte.
  - `?mode=throw`: lanza de verdad, para ejercitar `onRequestError` → `captureError` → Sentry.
    Genera un 500 real; el `errorId` queda solo en los logs y en Sentry.

  ```bash
  curl -s -H "Authorization: Bearer $CRON_SECRET" $APP/api/debug/error
  curl -s -H "Authorization: Bearer $CRON_SECRET" "$APP/api/debug/error?mode=throw"
  ```

  Úsala **cada vez que toques monitoreo, alertas o el DSN**: es la forma de saber que la cadena
  sigue viva sin esperar a que se rompa algo de verdad.

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

- **Hoy:** Vercel Analytics + Speed Insights + health checks + smoke workflow (`.github/workflows/smoke.yml`, corre tras cada deploy y cada 30 min) + captura estructurada de errores (`lib/log.ts` + `instrumentation.ts`, con `errorId` correlacionable).
- **Sentry:** SDK integrado en servidor y edge (`sentry.server.config.ts` / `sentry.edge.config.ts`), inerte sin `SENTRY_DSN`. Cada evento lleva el tag `errorId`, el mismo que sale en los logs de Vercel. Comprobar con `/api/debug/error` (§5). No cubre errores de navegador.
- **Uptime:** UptimeRobot, 2 monitores cada 5 min sobre `/api/health` y `/api/ready`, alerta por email. **Nunca se ha provocado una caída para comprobar que la alerta llega** — hacerlo un día tranquilo pausando un deploy.
- **Incidentes:** procedimiento paso a paso en `docs/INCIDENT_RESPONSE.md`.

## 9. Secretos

- Viven en **Vercel → Project → Settings → Environment Variables** (no en el repo). `.env.local` está gitignored.
- Esquema completo en `.env.example`.
- **Nunca** pegar secretos en chats, logs, frontend o commits. Si uno se expone → rotarlo.
- Al ponerlos por CLI, el valor va **en el prompt**, nunca en la línea del comando:
  `vercel env add NOMBRE production --scope max-ab784c70` y pegar cuando lo pida.
  Un valor en la línea acaba en el historial del shell, y un placeholder pegado por
  error acaba en producción (nos pasó el 10-ago-2026 con Turnstile).
- `vercel env pull` escribe **todos** los secretos a disco. Borrar el archivo al terminar.

### Cómo rotar una clave sin tirar producción

El orden importa. Siempre: **crear la nueva → ponerla en Vercel → redeploy → verificar → revocar la vieja.**
Revocar antes de desplegar deja producción sin credencial válida.

Verificar después de cada una: `/api/ready` en 200, y la función concreta que usa esa clave.

| Clave | Radio de daño si falla | Nota |
|---|---|---|
| `REPLICATE_API_TOKEN` | Render fotorrealista | Seguro |
| `ANTHROPIC_API_KEY` | Análisis y generador de recintos | Seguro |
| `RESEND_WEBHOOK_SECRET` | Métricas de campañas | Seguro |
| `CRON_SECRET` | Los 3 crons + `/api/debug/error` | Generar con `openssl rand -hex 32 \| pbcopy` |
| `RESEND_API_KEY` | **Entrega de boletos por correo** | Verificar con una compra de prueba |
| `STRIPE_WEBHOOK_SECRET` | **Confirmación de pagos** | Stripe da periodo de gracia al rotar |
| `STRIPE_SECRET_KEY` | **El cobro entero** | Stripe da periodo de gracia al rotar |
| `SUPABASE_SERVICE_ROLE_KEY` | **Todo**, ver abajo | Requiere ventana planificada |

**Antes de rotar `SUPABASE_SERVICE_ROLE_KEY`**, dos cosas que no son obvias:

1. En el esquema JWT clásico, rotarla **invalida también la anon key y cierra la sesión de todos los organizadores**.
2. Firma los enlaces de baja de los correos ya enviados (ver §11). Poner el valor viejo en
   `UNSUBSCRIBE_SECRET_LEGACY` **antes** de rotar, o esos enlaces dejan de funcionar.

## 11. Enlaces de baja (anti-spam)

`src/lib/email/unsubscribe.ts` firma y verifica los enlaces de "darse de baja".
Los correos ya enviados llevan la firma impresa y no se pueden reescribir, así que
**el primer secreto firma y todos verifican**: eso permite rotar sin invalidar lo enviado.

Orden de secretos: `UNSUBSCRIBE_SECRET` → `QUEUE_SECRET` → `SUPABASE_SERVICE_ROLE_KEY` → `UNSUBSCRIBE_SECRET_LEGACY`.
Sin variables nuevas, el comportamiento es idéntico al histórico.

Para desacoplarlo de Supabase (recomendado antes de rotar esa clave):

1. `UNSUBSCRIBE_SECRET` = valor nuevo aleatorio (`openssl rand -hex 32`).
2. `UNSUBSCRIBE_SECRET_LEGACY` = el valor **actual** de `SUPABASE_SERVICE_ROLE_KEY`.
3. Redeploy. Los enlaces nuevos usan el secreto dedicado; los viejos siguen validando.
4. Ya se puede rotar Supabase libremente.
5. Pasadas unas semanas, cuando las campañas viejas estén muertas, borrar `UNSUBSCRIBE_SECRET_LEGACY`.

Un enlace de baja roto no es cosmético: las leyes anti-spam exigen que funcione.

## 10. Idempotencia (procesos que pueden repetirse)

- **Checkout:** orden por `idempotency_key`; `confirm_order_paid` idempotente.
- **Webhook Stripe:** `idempotencyKey` en intents/transfers; update atómico.
- **Check-in:** `valid → checked_in` atómico (doble-scan = 0 filas).
- **Campañas/notificaciones:** jobs con claim `pending → processing → done`.
- **Cola offline de check-in:** sincroniza contra el servidor (autoridad de conflictos).
