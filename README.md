# ShaarPass (codename)

Plataforma de ticketing self-service — **competidor de Eventbrite**.
Diferenciador #1: **fees bajos y transparentes**. Nicho: abierto desde el inicio.

> `shaarpass` es nombre provisional. Rebranding pendiente.

---

## Stack

- **Next.js 15** (App Router) en Vercel
- **Supabase** (Postgres + Auth + RLS + Realtime + pg_cron)
- **Stripe Connect** (destination charges + payouts a organizadores)
- **Resend** (emails con QR)

## Arquitectura

Monolito modular. Dominios: `organizations`, `events`, `ticketing/inventory`,
`orders/payments`, `discovery`, `check-in`, `payouts`.

El **corazón** es el control de inventario atómico anti-overselling
(`supabase/migrations/0003_functions.sql`):

1. `create_hold()` — reserva con lock pesimista (`FOR UPDATE`) durante el checkout.
2. `confirm_order_paid()` — mueve hold→sold con guardia atómica e idempotente.
3. `CHECK (quantity_sold <= quantity_total)` — invariante físico a nivel BD.
4. `pg_cron` limpia holds expirados cada minuto → devuelve stock.

Es **imposible vender de más**, sin importar la concurrencia.

## Setup

```bash
npm install
cp .env.example .env.local   # rellena Supabase + Stripe + Resend
```

### Base de datos
Aplica las migraciones en orden (vía Supabase MCP `apply_migration`, CLI o SQL editor):

1. `0001_schema.sql` — 12 tablas
2. `0002_rls.sql` — Row Level Security multi-tenant
3. `0003_functions.sql` — inventario atómico + pg_cron

> Requiere las extensiones `pgcrypto` y `pg_cron` habilitadas en el proyecto.

### Stripe Connect
- Crea una plataforma Connect; cada organizador onboardea una cuenta Express.
- El cobro usa **destination charges**: el neto va al organizador y
  `application_fee_amount` = nuestra comisión (ver `src/lib/ticketing/fees.ts`).

```bash
npm run dev
```

## Flujo de compra

```
elegir boletos → POST /api/checkout (crea holds + orden pending + PaymentIntent)
              → pago (Stripe Elements) → webhook payment_intent.succeeded
              → confirm_order_paid (consume stock, emite QR) → email
```

---

## Estrategia de posicionamiento (resumen)

**Cómo ser "mucho mejor" que Eventbrite** — atacar sus 4 debilidades:

| Dolor de Eventbrite | Nuestro pilar |
|---|---|
| Fees ~15-20% ($1.79 fijo) | **Fees bajos y transparentes** (hero del sitio) |
| Retiene el dinero hasta post-evento + 20% reserva | **Payout rápido/instantáneo** (fase 2) |
| Soporte = bots inútiles | **Soporte humano real** |
| Plataforma genérica | UX + comunidad |

**Go-to-market (huevo-gallina):** supply-first. Conseguir los primeros
organizadores a mano, que cada uno traiga su audiencia (demanda + backlinks),
y SEO programático (`/d/{ciudad}/{categoria}/` + `Event` JSON-LD schema) desde día 1.

**Contexto de mercado:** Eventbrite fue comprada por Bending Spoons (mar-2026) →
ventana de oportunidad por descontento de usuarios y recortes esperados.

## Roadmap

- **Fase 0 (este repo):** esquema + RLS + inventario atómico + checkout/webhook ✅
- **Fase 1 — MVP:** UI crear/publicar evento, página pública, check-in PWA, dashboard, onboarding Connect
- **Fase 2:** payout instantáneo, promo codes, descubrimiento SEO
- **Fase 3:** SEO programático a escala, widgets embebibles, afiliados, app
- **Auditoría:** `/ln-620-codebase-auditor` en cada fase (seguridad/calidad/deps)
