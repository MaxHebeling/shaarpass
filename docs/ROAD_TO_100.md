# ROAD TO 100/100 — Confiabilidad de ShaarPass

Estado actual: **80/100** (last known good: commit servido en `/api/health`).
Leyenda: 🔑 = solo tú (consola/credenciales) · 🧑‍💻 = lo hace Claude en el repo cuando digas.

Marca `[x]` conforme completes. Los 6 del Bloque 1 dan el salto grande (→ ~95).

---

## 🔴 Bloque 1 — Lo que solo tú puedes hacer (80 → ~95)

- [ ] **1. Branch protection en `main`** 🔑 · *+4*
  - **Dónde:** GitHub → repo `MaxHebeling/shaarpass` → Settings → Branches → Add branch ruleset → Require status checks to pass → marcar **CI**.
  - **Por qué:** hace obligatorio el NO TEST → NO MERGE (hoy es convención, no barrera).
  - **Verificar:** abre un PR con un test roto → GitHub no deja hacer merge.

- [ ] **2. Sentry (error tracking)** 🔑+🧑‍💻 · *+5*
  - **Dónde:** crea proyecto en sentry.io → copia el `SENTRY_DSN` → Vercel → proyecto `shaarpass` → Settings → Environment Variables → añádelo (`printf "%s" "<dsn>" | vercel env add SENTRY_DSN production --scope max-ab784c70`).
  - **Por qué:** el código ya llama `captureError` con `errorId`; solo falta el destino. Hoy los 500 solo se ven en logs de Vercel.
  - **Verificar:** avísame con el DSN puesto → integro el SDK; luego un error de prueba aparece en Sentry con su `errorId`.

- [ ] **3. Uptime monitor + alerta** 🔑 · *+4*
  - **Dónde:** UptimeRobot o BetterStack → 2 monitores HTTP: `https://www.shaarpass.io/api/health` y `/api/ready` (cada 1–5 min) → canal de alerta (email/WhatsApp/Slack).
  - **Por qué:** que alguien se entere de una caída al instante, no en 30 min (el smoke de GitHub es el respaldo, no la alerta).
  - **Verificar:** pausa un deploy de prueba en Vercel → debe llegarte la alerta.

- [ ] **4. Verificar PITR + ENSAYAR un restore** 🔑 · *+6*
  - **Dónde:** Supabase → proyecto `abkzfztzavrsglowwkkw` → Database → Backups. Confirma que PITR está activo (según plan). Restaura a un proyecto de prueba.
  - **Por qué:** un backup que nunca se restauró no es un backup. Es el mayor riesgo real hoy.
  - **Verificar:** el proyecto restaurado abre y tiene los datos hasta el punto elegido.

- [ ] **5. Entorno de staging** 🔑+🧑‍💻 · *+5*
  - **Dónde:** Vercel → branch `staging` con su propia Preview + un proyecto Supabase aparte para pruebas.
  - **Por qué:** validar cambios grandes sin tocar producción.
  - **Verificar:** un push a `staging` despliega a una URL de preview con su propia BD; yo dejo el flujo y los docs.

- [ ] **6. Rotar secretos expuestos** 🔑 · *+3*
  - **Dónde:** consola de cada proveedor (Replicate, y cualquier clave pegada en chat) → generar nueva → actualizar en Vercel env → redeploy.
  - **Por qué:** toda clave que pasó por un chat se considera comprometida.
  - **Verificar:** la clave vieja da 401; la app sigue sana en `/api/ready`.

---

## 🟠 Bloque 2 — Código que hace Claude (avísame) (~95 → ~99)

- [ ] **7. Rate limiting con Upstash** 🧑‍💻 en rutas públicas (`lead`, `promo/validate`, `queue/join`), con degradación graciosa si Upstash no está configurado.
- [ ] **8. Cobertura E2E del checkout Stripe** 🧑‍💻 con webhooks mockeados (hoy cubro la lógica de fees, no el flujo de pago completo).
- [ ] **9. Integrar el SDK de Sentry** 🧑‍💻 (depende del ítem 2: necesito el DSN puesto).
- [ ] **10. Localizar `/precios` a MXN** 🧑‍💻 — hoy los ejemplos están en USD con matemática Stripe-US y no cuadran con el cobro real en pesos.

## 🟡 Bloque 3 — Robustez fina (~99 → 100)

- [ ] **11. Smoke con auto-rollback** 🔑+🧑‍💻 — requiere un `VERCEL_TOKEN` como secret de GitHub; con él, el smoke revierte prod solo si queda roja.
- [ ] **12. Dependabot** 🔑 — GitHub → Settings → Code security → Enable Dependabot (1 clic). PRs de seguridad automáticos.
- [ ] **13. SLO + presupuesto de errores** 🔑 — definir objetivo (ej. 99.9% en `/api/ready`) una vez haya monitoreo del ítem 3.

---

## Nota honesta

100/100 es un **piso operativo, no una foto**: se mantiene solo mientras el monitoreo, las alertas y el staging sigan vivos. Un 100 sin nadie mirando las alertas vuelve a bajar solo. Lo ya hecho (CI, tests, health, captura de errores, timeouts, idempotencia, migraciones al día, runbooks) es la base permanente sobre la que se apoya todo esto.

**Orden recomendado:** haz *ya* los ítems **1** y **3** (15 min, cero código) y consígueme el **DSN de Sentry** (ítem 2). Con eso arranco los ítems 🧑‍💻 en paralelo.
