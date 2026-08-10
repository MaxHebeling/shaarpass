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
`UPSTASH_REDIS_REST_URL`/`_TOKEN`/`QUEUE_SECRET` (cola edge), `TURNSTILE_*` (anti-bot),
`PLATFORM_FEE_*`/`STRIPE_PROCESSING_*` (comisiones), `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.

## Recomendada (pendiente)
`SENTRY_DSN` — error tracking.

## Seguridad
Nunca en el repo, frontend, logs ni chats. Si se expone una clave → rotarla en el proveedor y en Vercel.
