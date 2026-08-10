# STAGING — Entorno de pruebas aislado

Objetivo: validar cambios grandes (migraciones, cambios de checkout, features) **sin tocar
producción**. Staging es una copia con su **propia** base de datos y sus **propias** llaves de
prueba. Nunca comparte credenciales ni datos con prod.

Estado: **plantilla lista; falta que crees el proyecto Supabase y el branch en Vercel** (los 2
pasos 🔑). El resto (flujo, migraciones, variables) está definido aquí.

---

## Arquitectura

```
Rama git `staging` ──► Vercel (Preview del branch staging) ──► Supabase proyecto STAGING (aparte)
Rama git `main`    ──► Vercel (Production)                 ──► Supabase proyecto PROD (abkzfztzavrsglowwkkw)
```

- **Pagos:** en staging se usan llaves **de prueba** de Stripe (`sk_test`/`pk_test`) → cobros ficticios, cero dinero real.
- **Email:** puede reusar Resend con un remitente distinto, o dejar `RESEND_API_KEY` vacío (los emails son best-effort y no rompen nada).
- **Datos:** staging arranca vacío o con seed de prueba; jamás con datos reales de compradores.

---

## Puesta en marcha (una sola vez)

### 1. 🔑 Crear el proyecto Supabase de staging
- Supabase → New project → nombre `shaarpass-staging`, **misma región** (us-east-1).
- Anota: URL del proyecto, `anon key`, `service_role key`.

### 2. Aplicar el esquema a staging
El repo tiene las 49 migraciones en `supabase/migrations/`. Para reproducir el esquema en staging:
```bash
# con la CLI de Supabase, apuntando al proyecto staging:
supabase link --project-ref <ref-de-staging>
supabase db push        # aplica todas las migraciones en orden
```
> Alternativa sin CLI: ejecutar los archivos `0001…` en orden en el SQL Editor del proyecto staging.

### 3. 🔑 Crear la rama y el entorno en Vercel
- Crea la rama git: `git checkout -b staging && git push -u origin staging`.
- Vercel → proyecto `shaarpass` → Settings → **Git** → asegúrate de que las Preview del branch `staging` estén habilitadas (lo están por defecto).
- Vercel → Settings → **Environment Variables** → añade, con scope **Preview** (o Branch = `staging`), las variables apuntando a **staging**:

| Variable | Valor en staging |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto staging |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key de staging |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role de staging |
| `NEXT_PUBLIC_APP_URL` | la URL de preview de staging |
| `STRIPE_SECRET_KEY` | `sk_test_…` (modo prueba) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | del webhook de prueba (ver paso 4) |
| `CRON_SECRET` | uno propio de staging |
| `RESEND_API_KEY` / `EMAIL_FROM` | opcional (remitente de prueba o vacío) |
| `RESEND_WEBHOOK_SECRET` | opcional |

Esquema completo de variables: `.env.example`.

### 4. Webhook de Stripe (prueba) → staging
- Stripe (modo **test**) → Developers → Webhooks → endpoint a `https://<url-staging>/api/webhooks/stripe` con los eventos `payment_intent.succeeded`, `payment_intent.payment_failed`, `account.updated`.
- Copia su signing secret a `STRIPE_WEBHOOK_SECRET` (scope staging).

---

## Flujo de trabajo con staging

```
feature branch → PR → merge a `staging` → probar en la URL de preview
                                        → si OK: PR de `staging` a `main` → producción
```

- **Migraciones:** pruébalas primero en staging (`supabase db push`). Si rompen algo, lo ves aquí, no en prod.
- **Verificar staging:** `GET https://<url-staging>/api/health` (version) y `/api/ready` (`database:ok`, `config:ok`).
- **No** promuevas a `main` nada que no haya pasado por staging cuando el cambio toque BD, checkout o webhooks.

---

## Reglas

- **Nunca** copies datos reales de compradores a staging (PII).
- **Nunca** uses llaves `sk_live`/`pk_live` en staging.
- Staging puede pausarse cuando no se use (Supabase → Pause) para ahorrar; reactívalo antes de probar.
- Si staging y prod divergen de esquema, `supabase db push` en staging los realinea desde el repo (el repo es la fuente de verdad).
