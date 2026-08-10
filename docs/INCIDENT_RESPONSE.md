# INCIDENT RESPONSE — ShaarPass

Guía rápida para cuando algo falla en producción. Complementa `docs/RELIABILITY.md` (arquitectura, deploy, rollback, DR).

## 0. Primeros 2 minutos

1. **¿La app responde?** `curl -s https://www.shaarpass.io/api/health`
2. **¿Dependencias sanas?** `curl -s https://www.shaarpass.io/api/ready` → `database` y `config` deben ser `ok`.
3. **¿Qué versión corre?** el campo `version` de `/api/health` = SHA del commit.
4. **¿Empezó tras un deploy?** compara `version` con el último commit de `main`. Si el deploy es el sospechoso → **rollback** (paso 2 abajo).

## 1. Clasificar severidad

| Sev | Definición | Acción |
|---|---|---|
| **SEV1** | No se puede comprar / pagar / entrar al evento | Rollback inmediato, luego investigar |
| **SEV2** | Función importante caída (emails, campañas, un flujo) | Mitigar; fix con calma |
| **SEV3** | Cosmético o degradación menor | Ticket normal |

## 2. Rollback (mitigación #1)

La mayoría de incidentes tras deploy se resuelven volviendo al último **LAST KNOWN GOOD**:

1. Vercel → proyecto `shaarpass` → **Deployments**.
2. Localiza el último deploy `Ready` bueno (antes del incidente).
3. **⋯ → Promote to Production** (instantáneo, sin rebuild). CLI: `vercel rollback <url> --scope max-ab784c70`.
4. Verifica con `/api/health` que `version` cambió al SHA bueno.

> El rollback de código **no** revierte migraciones de BD. Si el problema es de esquema, ver §5.

## 3. Diagnóstico por síntoma

- **500s generalizados** → Vercel → Logs (o Runtime Logs). Busca el `errorId` que emite `captureError` (log estructurado JSON). El `Ref:` que ve el usuario en la página de error correlaciona con ese `errorId`.
- **Checkout falla** → revisa Stripe Dashboard (Events/Logs) + `/api/webhooks/stripe`. El cobro es idempotente; reintentar es seguro.
- **`/api/ready` da 503 con `database:fail`** → incidente de Supabase (status.supabase.com) o red. No hay failover (SPOF); esperar/escalar a Supabase.
- **`/api/ready` da 503 con `config:fail`** → falta una variable de entorno; `configMissing` lista los nombres. Añádela en Vercel env y redeploy.
- **Emails no salen** → Resend Dashboard; el resto del sistema sigue (best-effort).
- **IA (recintos/render) falla** → degradación esperada; timeouts en `lib/http.ts` evitan que cuelgue. No es SEV1.

## 4. Credencial comprometida

1. Rota la clave en el proveedor (Stripe/Supabase/Resend/Replicate/Anthropic).
2. Actualiza el valor en Vercel → Settings → Environment Variables.
3. Redeploy (`vercel --prod`).
4. Verifica que la clave vieja quedó revocada (401) y la app sigue sana (`/api/ready`).

## 5. Migración rompió producción

1. **No** basta el rollback de código.
2. Evalúa si la migración fue aditiva (columna/tabla/índice nuevos → normalmente inofensiva de dejar) o destructiva.
3. Si hubo pérdida/corrupción de datos → restaurar por **PITR** (Supabase → Database → Backups) al punto previo a la migración.
4. Corrige la migración en el repo y vuelve a desplegar por el flujo normal (branch + PR + CI verde).

## 6. Cierre del incidente

- Confirma `/api/health` + `/api/ready` verdes y el flujo afectado funcionando.
- Anota en este archivo (o en un post-mortem): **qué pasó, causa raíz, cómo se mitigó, cómo se evita que vuelva** (test de regresión, guard, alerta).
- Si faltó un test que lo habría atrapado, créalo antes de cerrar.
