# PLAN — Paridad con Ticketmaster / Live Nation (epic "TM")

> Estado: **propuesta para aprobación**. No se implementa hasta tu OK.
> Autor: The Architect · Fecha: 2026-06-01 · Basado en research de TM/LN 2025-26.

---

## 0. Encuadre estratégico (leer primero)

Ticketmaster tiene **3 fosos que NO se replican con código**:
1. **Infra calibrada** para picos de millones (se afina con años de onsales reales que rompen el sistema).
2. **Anti-bot/identidad a escala** — que *ni ellos* dominan (la FTC los demandó en sep-2025 por no frenar a los brokers).
3. **Integración vertical** (promotor + venues + ticketing) — declarada **monopolio ilegal por un jurado (abr-2026)**, con posible **breakup de Ticketmaster**.

**Implicación:** "igualar a Ticketmaster" = **igualar su tecnología de cara al fan**, NO su monopolio (que es ilegal y se está desmantelando). Y hay **ventana competitiva abierta**. El posicionamiento de ShaarPass (fees bajos y transparentes) es el **anti-Ticketmaster** — lo mantenemos como diferenciador.

**Lo que YA tenemos y TM presume:** asientos reservados a escala de estadio (✅), mapa de venta LOD 50k, cumplimiento de la *Junk Fees Rule* (precio total transparente).

**Lo que NO vamos a copiar a propósito:** **precios dinámicos / Platinum**. Es un pasivo regulatorio (caso Oasis/CMA 2024-25) y contradice nuestra marca. Decisión firme.

---

## 1. Gap construible (de cara al fan)

| # | Función | Esfuerzo | Por qué |
|---|---------|----------|---------|
| TM‑1 | Cola virtual / waiting room | Alto | Feature insignia; sin ella no hay onsale masivo |
| TM‑2 | Transferencia + reventa a precio tope | Medio | Anti-scalper; refuerza la marca justa |
| TM‑3 | QR rotativo seguro (TOTP, estilo SafeTix) | Medio | Anti-fraude/anti-captura |
| TM‑4 | Verified Fan / presale + lotería + códigos | Medio | Filtra bots/scalpers, ventanas escalonadas |
| TM‑5 | "Best available" + filtros de precio en el mapa | Bajo | Estándar de la industria |
| TM‑6 | Límites de compra + anti-bot (cumplir BOTS Act) | Medio | Legal + integridad del onsale |
| TM‑7 | Abonos / temporada / Account Manager | Alto | B2B con equipos/venues; relaciones, no tech |

---

## 2. Arquitectura por fase

### TM‑1 — Cola virtual (la pieza central)
**Objetivo:** que un evento "high-demand" ponga una sala de espera; al abrir la venta se asigna **posición aleatoria** (no por orden de llegada) y se admite a la gente en **oleadas** hacia el checkout, protegiendo el inventario.

- **Datos:** `queue_sessions(id, event_id, token, identity_hash, position, status[waiting|admitted|expired|used], joined_at, admitted_at, admit_expires_at)`; `events.queue_enabled`, `events.onsale_at`.
- **Flujo:**
  1. Antes del onsale: el fan entra al "lobby" → `POST /api/queue/join` → recibe token (cookie httpOnly) + estado `waiting`.
  2. Al llegar `onsale_at`: un **sorteo** asigna `position` aleatoria a todos los del lobby (los tardíos se anexan al final).
  3. Un **controlador** (pg_cron cada ~10s o Edge tick) admite los siguientes N tokens (`status=admitted`, `admit_expires_at = now()+10min`) en oleadas.
  4. El cliente hace polling a `GET /api/queue/status` → muestra posición / "es tu turno".
  5. `/api/checkout` exige un token `admitted` y no expirado para eventos con cola. Al pagar → `used`.
- **Anti-abuso:** 1 token activo por identidad (email/cookie/IP), rate-limit del join, CAPTCHA opcional (Turnstile).
- **Honestidad de escala:** Postgres + Vercel aguanta **miles–decenas de miles** en cola. Para **millones reales** la cola debe vivir en el **edge** (Cloudflare Waiting Room o Upstash Redis con contadores atómicos) → **fase TM‑1b** (upgrade de infra). El MVP usa Postgres + cron; documentado el camino al edge.

### TM‑2 — Transferencia + reventa a precio tope
**Objetivo:** transferir boletos a un amigo y revender fan-to-fan **topado al precio pagado** (anti-scalping), con autenticidad garantizada (reemitimos el QR).

- **Datos:** `ticket_transfers(ticket_id, from_email, to_email, status)`; `listings(id, ticket_id, price_cents, status[active|sold|cancelled], seller_email)`.
- **Transferencia:** reasigna `tickets.attendee` + invalida el QR viejo y **rota el seat/token** al nuevo dueño.
- **Reventa:** `price_cents <= total_pagado` (tope configurable por el organizador). Comprador paga (Stripe) → ticket reasignado + reemitido (QR nuevo) + vendedor recibe payout (menos fee mínimo). El boleto original se anula.
- **Encaje de marca:** reventa **justa** (sin scalping) = exactamente nuestra propuesta vs el mercado gris.

### TM‑3 — QR rotativo seguro (estilo SafeTix, con TOTP)
**Objetivo:** boleto cuyo código **refresca cada ~15s** (screenshot inservible), entrega móvil.

- **Mecanismo:** cada ticket tiene un secreto. El código mostrado = `bearer_token : TOTP(secret_evento) : TOTP(secret_cliente) : timestamp` (HMAC-SHA1, step 15s — el mismo patrón que SafeTix, criptografía estándar).
- **Implementación:** `GET /api/ticket/[token]/code` devuelve el código fresco (server computa TOTP); la página móvil del boleto **re-pide cada 15s**. El escáner (`/api/checkin`) **recomputa y valida** el TOTP dentro de la ventana + marca checked_in.
- **Compat:** el QR estático actual queda como modo simple; SafeTix es opt-in por evento.
- **Nota legal:** TM tiene **patente sobre el barcode rotativo** (litigio nov-2025). TOTP es estándar abierto; implementamos lo nuestro, pero lo marco como zona de revisar IP antes de comercializar fuerte.

### TM‑4 — Verified Fan / presale / lotería
**Objetivo:** registro previo → lotería que selecciona un subconjunto → código por persona → ventana de presale.

- **Datos:** `presale_registrations(event_id, email, selected, code, created_at)` + reusar el sistema de **access codes** (sobre `promo_codes` con descuento 0 = código de acceso).
- **Flujo:** ventana de registro → el organizador/sistema corre un **sorteo** seleccionando N% → genera códigos únicos → email (Resend). En la ventana de presale, `/api/checkout` exige código válido para ese evento.

### TM‑5 — "Best available" + filtros de precio
- En `SalesMap`: botón **"Mejores asientos disponibles (N)"** que elige los N mejores contiguos por un **ranking** (cercanía a escenario/centro, derivado de `pos`). Slider de **rango de precio** que resalta zonas dentro del rango y agrisa el resto (como TM).

### TM‑6 — Límites de compra + anti-bot
- `events.max_tickets_per_buyer`. `/api/checkout` cuenta los boletos del comprador para el evento y rechaza si excede.
- **Rate limiting** (IP/email) en join y checkout; **CAPTCHA** (Cloudflare Turnstile) en join/checkout.
- **Cumplimiento BOTS Act:** no permitir eludir límites; loguear intentos. (La *Junk Fees Rule* ya la cumplimos.)

### TM‑7 — Abonos / temporada / Account Manager (fase tardía)
- Paquetes de temporada, planes flexibles (arma tu calendario), gestión B2B para equipos/venues, transferencia/reventa de abonos. **Relaciones > tech.** Se planifica aparte cuando haya un cliente tipo equipo deportivo.

---

## 3. Orden recomendado y por qué

```
TM‑1 cola → TM‑6 límites/anti-bot → TM‑3 QR seguro → TM‑2 transfer/reventa → TM‑4 verified fan → TM‑5 best-available → TM‑1b edge (escala real) → TM‑7 abonos
```
Razón: la **cola** es la insignia y desbloquea onsales grandes; **límites/anti-bot** la protegen (van juntas); **QR seguro** y **transfer/reventa** elevan confianza y encajan con la marca; **verified fan** y **best-available** pulen; **edge** y **abonos** son escala/relaciones posteriores.

(Si prefieres empezar por TM‑2 por encajar con la marca "anti-scalper", también es defendible — tú decides.)

---

## 4. Riesgos / decisiones

- **Escala real de la cola:** el MVP en Postgres NO es Ticketmaster-scale; el salto a millones es infra de edge (TM‑1b). Lo digo claro para no vender humo.
- **Patente SafeTix:** revisar IP antes de comercializar el QR rotativo agresivamente.
- **Precios dinámicos:** descartados a propósito (pasivo regulatorio + anti-marca).
- **Anti-bot:** sin la telemetría masiva de TM, apuntamos a límites + rate-limit + CAPTCHA (suficiente para el 95% de casos; el abuso de brokers sofisticados es un problema que ni TM resuelve).
- **CAPTCHA/edge** introducen dependencias nuevas (Turnstile, quizá Upstash/Cloudflare) — costo/ops.

---

## 5. Decisiones abiertas (necesito tu input al aprobar)

1. **¿Orden?** ¿TM‑1 (cola) primero como recomiendo, o TM‑2 (transfer/reventa) por marca?
2. **Escala objetivo del MVP de cola:** ¿decenas de miles (Postgres+cron, sin infra extra) o vamos directo al edge (Upstash/Cloudflare) para apuntar a cientos de miles+? Lo segundo añade infra/costo.
3. **CAPTCHA:** ¿OK con integrar Cloudflare Turnstile (gratis) para anti-bot?
4. **Reventa:** ¿tope estricto a face value (anti-scalp puro) o permitir un margen pequeño configurable por el organizador?

---

> **Esperando tu aprobación / ajustes antes de implementar TM‑1.**
