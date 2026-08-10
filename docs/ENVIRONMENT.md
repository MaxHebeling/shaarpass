# ENVIRONMENT — Variables de entorno

Esquema completo con placeholders: **`.env.example`** (raíz del repo). Aquí, dónde viven y cuáles son obligatorias.

## Dónde viven
- **Local:** `.env.local` (gitignored). Copia de `.env.example`.
- **Producción/Preview:** Vercel → proyecto `shaarpass` → Settings → Environment Variables (scope `max-ab784c70`).
  - Añadir: `printf "%s" "<valor>" | vercel env add <NOMBRE> production --scope max-ab784c70` (usa `printf`, no `echo`, para no meter `\n`).
  - Tras cambiar env: **redeploy** (`vercel --prod`) para que tome efecto.

## Requeridas para que funcione el core
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_APP_URL`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
`STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`.

## Opcionales (features)
`ANTHROPIC_API_KEY` (+`ANTHROPIC_MODEL`), `REPLICATE_API_TOKEN` (+`REPLICATE_MODEL`),
`UPSTASH_REDIS_REST_URL`/`_TOKEN`/`QUEUE_SECRET` (cola edge **y rate limiting**), `TURNSTILE_*` (anti-bot),
`PLATFORM_FEE_*`/`STRIPE_PROCESSING_*` (comisiones), `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.

## Rate limiting (`src/lib/rateLimit.ts`)
Sin variables extra: reutiliza las de la cola edge. Backends en orden —
**Upstash** (si hay `UPSTASH_REDIS_REST_URL` + `_TOKEN`) → **Postgres** (RPC `hit_rate_limit`,
migración 0023) → **fail-open** (permite y deja un `warn` con `backend: "none"`).
Nunca bloquea una venta por estar caído; el respaldo anti-bot real es Turnstile.

## Error tracking — Sentry
| Variable | Dónde | Efecto |
|---|---|---|
| `SENTRY_DSN` | Vercel (server) | **Enciende Sentry.** Sin ella el SDK no se inicializa y `captureException` es no-op. |
| `SENTRY_TRACES_SAMPLE_RATE` | opcional | Muestreo de trazas. Default `0.1`. |
| `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` | opcional, build | Sube source maps (stack traces legibles). Sin token no se generan ni se suben. |

Cada error lleva el tag `errorId`, el mismo que aparece en los logs de Vercel: se busca
el id en Sentry y se cruza con el log estructurado.

Alcance actual: **servidor y edge**. Los errores de navegador (`global-error.tsx`) todavía
no se envían — requeriría `NEXT_PUBLIC_SENTRY_DSN` y sumar el SDK al bundle del cliente.

Verificar tras poner el DSN: provoca un 500 en cualquier ruta y comprueba que el evento
aparece en Sentry con el mismo `errorId` que salió en los logs de Vercel.

## Seguridad
Nunca en el repo, frontend, logs ni chats. Si se expone una clave → rotarla en el proveedor y en Vercel.
