# ROAD TO 100/100 — Confiabilidad de ShaarPass

**12 de 13 ítems cerrados** (última actualización: 10-ago-2026).
Cerrados: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12. Queda solo **13** (definir SLO en UptimeRobot).

A propósito no pongo un número sobre 100: los puntos de abajo eran una guía para priorizar, no una
métrica. Lo que sí se puede afirmar hoy, porque está verificado y no solo configurado:

- Los errores de servidor llegan a Sentry con un `errorId` que cruza con los logs de Vercel.
- Dos monitores externos vigilan `/api/health` y `/api/ready` cada 5 min y alertan por email.
- `main` no acepta nada que no venga por PR con el check `verify` en verde.
- 101 pruebas automáticas, incluido el flujo de pago completo y el boundary de auth.
- **Un restore se probó de verdad:** el backup del 09-ago restaurado a un proyecto nuevo reprodujo
  los datos exactos (9 events / 99 orders / 110 tickets / 3 orgs), sin tocar producción.

El riesgo grande que quedaba (ensayar un restore) ya está cerrado. Lo que sigue abierto es robustez
y una fuga conocida: **el Storage no entra en los backups** (ver ítem 4).

Leyenda: 🔑 = solo tú (consola/credenciales) · 🧑‍💻 = lo hace Claude en el repo cuando digas.

---

## 🔴 Bloque 1 — Lo que solo tú puedes hacer

- [x] **1. Branch protection en `main`** 🔑 · *hecho 10-ago-2026*
  - Ruleset **`main protegida — CI obligatorio`**, Active, **bypass list vacía** (nadie la salta, tú incluido).
  - Exige: pull request (0 aprobaciones, para no bloquearte al trabajar solo), que pase el check
    `verify`, y bloquea force push y borrado de `main`.
  - **Verificado:** en el PR #3 el check aparece como `Required` y el botón de merge queda gris
    hasta que pasa. Ya no se puede pushear directo a `main`.

- [x] **2. Sentry (error tracking)** 🔑+🧑‍💻 · *hecho 10-ago-2026*
  - `SENTRY_DSN` en Vercel (production) + SDK integrado en servidor y edge.
  - **Verificado de punta a punta:** el `errorId` que devuelve `/api/debug/error` apareció en Sentry
    (proyecto `SHAARPASS-1`) y los dos caminos funcionan — captura directa y `onRequestError`.
  - **No cubierto:** errores de navegador. Requeriría `NEXT_PUBLIC_SENTRY_DSN` y sumar el SDK al
    bundle del cliente (~40 kB en cada carga). Decisión consciente, no olvido.

- [x] **3. Uptime monitor + alerta** 🔑 · *hecho 10-ago-2026*
  - UptimeRobot, dos monitores HTTP cada 5 min: **ShaarPass — health** y **ShaarPass — ready**.
  - El de `ready` es el que importa: da 503 si la BD o la config fallan aunque la app responda.
  - Alerta por email a `maxhebeling@gmail.com`.
  - **Pendiente tuyo:** instalar la app de UptimeRobot y activar el push. Sin eso, una caída de
    madrugada te espera hasta el desayuno — el email es registro, no alarma.
  - **Sin verificar todavía:** nunca se ha provocado una caída real para ver si la alerta llega.
    Pausa un deploy en Vercel algún día tranquilo y compruébalo.

- [x] **4. Verificar backups + ENSAYAR un restore** 🔑 · *hecho 10-ago-2026*
  - **Backups:** plan **Pro** → backups diarios físicos (uno por día, ~medianoche de la región).
    Sin add-on PITR: la pérdida máxima en el peor caso es de hasta ~24 h. Aceptable al volumen actual
    (última orden del 01-jul); si el flujo de órdenes crece, activar **PITR** (pestaña "Point in time").
  - **Restore probado:** con **"Restore to new project (BETA)"** se restauró el backup del 09-ago a un
    proyecto nuevo (`shaarpass-restore-test`) sin tocar producción. La query de conteo dio **exacto**:
    9 events / 99 orders / 110 tickets / 3 orgs, última orden 2026-07-01 17:18:30 UTC. Proyecto de
    prueba pausado/borrado tras verificar.
  - **⚠️ Fuga conocida — el Storage NO entra en los backups.** Los backups son solo de la base de
    datos; los buckets (`venue-plans`, `org-logos`, imágenes de boletos) **no** se respaldan. La BD
    guarda las rutas, no los archivos. Si se borra un objeto de Storage, el restore de BD no lo
    recupera. **Mitigado:** `npm run backup:storage` (`scripts/backup-storage.mjs`) descarga todos los
    buckets a disco con manifiesto. Correrlo con la service role real como one-off y subir la copia a
    tu destino de respaldo; ver `RELIABILITY.md §7`. Automatizar el envío a un destino externo queda
    como mejora futura.

- [x] **5. Entorno de staging** 🔑+🧑‍💻 · *cerrado 10-ago-2026* — **operativo y verificado.**
  Proyecto Supabase `shaarpass-staging` (ref `ijakjbpefnnausjqiimd`, us-east-1) cargado con el baseline
  (reproduce prod exacto: 42/56/50/11/3/5). Rama `staging` en Vercel con las **11 variables** en scope
  **Preview** (Supabase staging + APP_URL de rama + CRON generado). Deploy `staging` **READY**.
  Validado: `database:ok` (query de readiness contra la BD de staging) y `config:ok` (11 vars presentes).
  El `/api/ready` HTTP vive detrás de Vercel SSO (bueno para staging); se validaron sus dos chequeos
  directamente. Runbook: `docs/STAGING.md`.
  - **Pendiente menor (no bloquea):** Stripe en Preview son **placeholders** `sk_test`/`pk_test` — hacen
    pasar `config:ok`, pero para probar un cobro real en staging hay que poner llaves test reales.
  - **Verificar tú mismo:** abre `https://shaarpass-git-staging-max-ab784c70.vercel.app/api/ready` en el
    navegador (logueado en Vercel el SSO pasa solo) → `database:ok`, `config:ok`.

- [x] **6. Rotar secretos expuestos** 🔑 · *hecho 10-ago-2026 (DB passwords)*
  - **Hecho:** rotadas las **DB passwords** de prod (`abkzfztzavrsglowwkkw`) y staging (`ijakjbpefnnausjqiimd`)
    que pasaron por la terminal durante el `pg_dump`/carga. Verificado tras rotar: prod `/api/ready`
    en `database:ok` + `config:ok`, staging alcanzable — nada se rompió (la app usa API keys, no la DB password).
  - **Opcional pendiente:** si el `REPLICATE_API_TOKEN` u otra clave se pegó en chat en el pasado, rótala
    igual por higiene (Replicate → regenerar → Vercel env → redeploy). No urgente.
  - **Verificar:** la clave vieja da 401; la app sigue sana en `/api/ready`.
  - **Nota:** el `SENTRY_DSN` **no** entra aquí. Un DSN es público por diseño (solo permite enviar
    eventos, no leer), va embebido en el JS del cliente de cualquier app. No hay que rotarlo.
  - **Sí entra:** si en algún momento generas `.env.production.local` con `vercel env pull`, ese
    archivo tiene todos tus secretos en disco. Está en `.gitignore`, pero bórralo al terminar.

---

## 🟠 Bloque 2 — Código que hace Claude (avísame) (~95 → ~99)

- [x] **7. Rate limiting con Upstash** 🧑‍💻 — `src/lib/rateLimit.ts`: Upstash → RPC `hit_rate_limit` → fail-open,
  con cabecera `Retry-After`. Se enciende solo al poner `UPSTASH_REDIS_REST_URL`/`_TOKEN`; sin ellas usa el respaldo
  Postgres, igual que antes. **Aplicado en las 10 rutas** de cara al usuario: `lead`, `promo/validate` (antes no
  tenían ninguno), `queue/join`, `checkout`, `season-checkout`, `resale/checkout` y las tres de `ticket/*`
  (`transfer`/`code`/`list`). Ya no queda ninguna llamada directa a `hit_rate_limit` fuera del helper.
- [x] **8. Cobertura E2E del checkout Stripe** 🧑‍💻 — 32 pruebas sobre las rutas HTTP reales con Stripe y Supabase
  mockeados (`src/test/fakeSupabase.ts`): validación, rate limit, idempotencia, precios autoritativos desde la BD,
  límite por comprador, cola y presale, evento gratis; y en el webhook: firma, idempotencia, 500 para que Stripe
  reintente, reventa, abonos y `account.updated`. Verificadas por mutación: romper el cálculo del fee las pone en rojo.
- [x] **9. Integrar el SDK de Sentry** 🧑‍💻 — `@sentry/nextjs` cableado en servidor y edge, con el mismo `errorId`
  como tag para cruzar Sentry ↔ logs de Vercel. **Inerte sin DSN**: se puede mergear ya y no hace nada hasta que
  pongas `SENTRY_DSN` en Vercel (ítem 2) y redespliegues. Detalle en `docs/ENVIRONMENT.md`.
  *No incluido:* errores de navegador (requiere `NEXT_PUBLIC_SENTRY_DSN` y sumar el SDK al bundle del cliente).
- [x] **10. Localizar `/precios` a MXN** 🧑‍💻 — todo en pesos con matemática Stripe MX (3.6% + $3) y comparación
  contra las tarifas **publicadas de Eventbrite México** (3.99% de servicio + 2% de procesamiento) en vez de las de
  EE. UU. **Hallazgo:** con cifras mexicanas Eventbrite sale más barato para el comprador por debajo de ~$1,200
  por boleto; la página ahora lo dice en vez de esconderlo y apoya el argumento en lo verificable (100% del precio
  al organizador el mismo día, fee desglosado antes de pagar, reventa topada al precio original).

## 🟡 Bloque 3 — Robustez fina (~99 → 100)

- [x] **11. Smoke con auto-rollback** 🔑+🧑‍💻 · *armado 10-ago-2026* — job `rollback` en `smoke.yml` +
  secret `VERCEL_TOKEN` puesto en GitHub (token dedicado de Vercel). **Activo:** si el smoke falla **tras
  un deploy** (no en los chequeos programados), reconfirma 3 veces y revierte prod con `vercel rollback`.
  Se ejercita de verdad en el próximo deploy que dejara `/api/ready` en rojo (o pausando un deploy de prueba).
- [x] **12. Dependabot** 🔑 · *hecho 10-ago-2026* — activados: dependency graph, alerts, malware alerts,
  security updates y grouped updates (agrupa los PRs para que no te inunden). Dejamos fuera *version updates*,
  que exige un `dependabot.yml` y genera mucho más ruido.
  **Por qué subió de prioridad:** ese mismo día, un `npm audit` de rutina destapó que Next 16.2.7 arrastraba 9 avisos, uno de
  ellos un bypass de middleware/proxy en App Router con Turbopack ([GHSA-6gpp-xcg3-4w24](https://github.com/advisories/GHSA-6gpp-xcg3-4w24))
  — justo el mecanismo que protege `/dashboard`. Llevaba semanas ahí sin que nada avisara. Se resolvió subiendo a
  Next 16.3.0 + postcss (`npm audit` en 0). Al activarlo, Dependabot confirmó por su cuenta las mismas 14 alertas
  contra `main`. Es lo que hace que la próxima vez el aviso llegue solo, en lugar de por casualidad.
- [ ] **13. SLO + presupuesto de errores** 🔑 — definir objetivo (ej. 99.9% en `/api/ready`) una vez haya monitoreo del ítem 3.

---

## Nota honesta

Esto es un **piso operativo, no una foto**: se mantiene solo mientras el monitoreo, las alertas y el staging
sigan vivos. Un tablero verde sin nadie mirando las alertas se degrada solo. Lo ya hecho (CI, tests, health,
captura de errores, timeouts, idempotencia, migraciones al día, runbooks) es la base permanente.

Dos cosas que hoy están **configuradas pero no probadas**, y conviene no confundirlas con "resueltas":

1. **La alerta de caída nunca ha sonado.** Los monitores están verdes, pero verde solo demuestra que el sitio
   está arriba, no que el aviso llegue cuando se caiga. Pausa un deploy algún día tranquilo y compruébalo.
2. **El backup nunca se ha restaurado** (ítem 4). Sigue siendo el mayor riesgo real del proyecto.

**Orden recomendado ahora:** ítem **4** (ensayar el restore — el riesgo más grande), luego **6** (rotar las
claves que pasaron por chat) y **5** (staging, para dejar de validar cambios grandes en producción).
