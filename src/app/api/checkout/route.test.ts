/**
 * Cobertura E2E del checkout de Stripe (sin red).
 *
 * Ejercita la ruta HTTP completa —validación, rate limit, idempotencia, precios
 * autoritativos desde la BD, límites por comprador y creación del PaymentIntent—
 * con Supabase y Stripe mockeados. Lo que se protege aquí es el dinero: que el
 * `amount` cobrado y el `application_fee_amount` salgan siempre de computeFees y
 * nunca del cliente.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeDb, type QueryContext, type FakeDb } from "@/test/fakeSupabase";
import { computeFees } from "@/lib/ticketing/fees";

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  paymentIntentsCreate: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db }));
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({ paymentIntents: { create: h.paymentIntentsCreate } }),
}));
vi.mock("@/lib/email/tickets", () => ({ sendTicketEmail: vi.fn(async () => undefined) }));
vi.mock("@/lib/email/campaignSend", () => ({ sendWelcome: vi.fn(async () => undefined) }));
vi.mock("@/lib/email/campaigns", () => ({ sendBulkEmail: vi.fn(async () => undefined) }));

import { POST } from "./route";

// ─── fixtures ────────────────────────────────────────────────────────────────

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const TYPE_ID = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const ORDER_ID = "44444444-4444-4444-8444-444444444444";

const PRICE_CENTS = 25_000; // $250.00 MXN
const QTY = 2;

type Overrides = {
  event?: Record<string, unknown>;
  priceCents?: number;
  existingOrder?: { id: string; stripe_payment_intent_id: string | null } | null;
  rpc?: Record<string, { data?: unknown; error?: unknown }>;
};

/** Valor con el que se filtró una columna (p. ej. filterVal(ctx, "idempotency_key")). */
function filterVal(ctx: QueryContext, column: string): unknown {
  return ctx.filters.find((f) => f.args[0] === column)?.args[1];
}

function setup(o: Overrides = {}) {
  const event = {
    id: EVENT_ID,
    org_id: ORG_ID,
    currency: "mxn",
    status: "published",
    queue_enabled: false,
    onsale_at: null,
    queue_wave_size: 50,
    max_tickets_per_buyer: null,
    presale_enabled: false,
    presale_ends_at: null,
    organizations: { stripe_account_id: "acct_org_123", payouts_enabled: true },
    ...o.event,
  };
  const price = o.priceCents ?? PRICE_CENTS;

  h.db = createFakeDb({
    rpc: (fn) => {
      if (o.rpc?.[fn]) return o.rpc[fn];
      if (fn === "hit_rate_limit") return { data: true };
      return { data: null };
    },
    tables: (ctx) => {
      if (ctx.table === "orders" && ctx.op === "select") {
        // Chequeo de idempotencia.
        if (filterVal(ctx, "idempotency_key") !== undefined) return { data: o.existingOrder ?? null };
        // Relectura para el correo (flujo gratis).
        return {
          data: {
            buyer_email: "ana@test.mx",
            total_cents: 0,
            currency: "mxn",
            events: { title: "Concierto", slug: "concierto", cover_image: null, starts_at: "2026-09-01T02:00:00Z", timezone: "America/Mexico_City", safetix_enabled: false },
            organizations: { name: "Org", logo_url: null, white_label: false },
          },
        };
      }
      if (ctx.table === "orders" && ctx.op === "insert") return { data: { id: ORDER_ID } };
      if (ctx.table === "events") return { data: event };
      if (ctx.table === "ticket_types") {
        return { data: [{ id: TYPE_ID, price_cents: price, currency: "mxn", event_id: EVENT_ID }] };
      }
      if (ctx.table === "tickets") return { data: [{ qr_token: "qr_1", ticket_types: { name: "General" } }] };
      return undefined;
    },
  });

  h.paymentIntentsCreate = vi.fn(async () => ({ id: "pi_test_123", client_secret: "pi_test_123_secret" }));
}

function body(extra: Record<string, unknown> = {}) {
  return {
    eventId: EVENT_ID,
    buyerEmail: "ana@test.mx",
    buyerFirstName: "Ana",
    buyerLastName: "López",
    buyerCity: "Guadalajara",
    buyerCountry: "México",
    sessionId: "sess_abcdefgh",
    idempotencyKey: "idem_abcdefgh",
    items: [{ ticketTypeId: TYPE_ID, quantity: QTY }],
    ...extra,
  };
}

function post(payload: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("https://www.shaarpass.io/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "189.0.0.1", ...headers },
      body: JSON.stringify(payload),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setup();
});

// ─── validación y defensa ────────────────────────────────────────────────────

describe("checkout — validación y defensa", () => {
  it("payload inválido → 400 y no toca Stripe", async () => {
    const res = await post({ eventId: "no-es-uuid" });
    expect(res.status).toBe(400);
    expect(h.paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("rate limit excedido → 429 con Retry-After y sin cobrar", async () => {
    setup({ rpc: { hit_rate_limit: { data: false } } });
    const res = await post(body());
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(h.paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("evento no publicado → 404", async () => {
    setup({ event: { status: "draft" } });
    const res = await post(body());
    expect(res.status).toBe(404);
    expect(h.paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("organizador sin pagos habilitados → 409", async () => {
    setup({ event: { organizations: { stripe_account_id: null, payouts_enabled: false } } });
    const res = await post(body());
    expect(res.status).toBe(409);
    expect(h.paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("supera el límite de boletos por comprador → 409", async () => {
    setup({ event: { max_tickets_per_buyer: 1 } });
    const res = await post(body());
    expect(res.status).toBe(409);
    expect(h.paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("cuenta compras previas contra el límite → 409", async () => {
    setup({ event: { max_tickets_per_buyer: 3 }, rpc: { hit_rate_limit: { data: true }, buyer_ticket_count: { data: 2 } } });
    const res = await post(body()); // 2 previos + 2 nuevos > 3
    expect(res.status).toBe(409);
  });
});

// ─── idempotencia ────────────────────────────────────────────────────────────

describe("checkout — idempotencia", () => {
  it("una key ya usada devuelve la orden existente sin cobrar de nuevo", async () => {
    setup({ existingOrder: { id: ORDER_ID, stripe_payment_intent_id: "pi_previo" } });
    const res = await post(body());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ orderId: ORDER_ID, reused: true });
    expect(h.paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("pasa la idempotencyKey a Stripe (dedup del lado servidor)", async () => {
    await post(body());
    expect(h.paymentIntentsCreate).toHaveBeenCalledWith(expect.anything(), { idempotencyKey: "idem_abcdefgh" });
  });
});

// ─── el dinero ───────────────────────────────────────────────────────────────

describe("checkout — el cobro cuadra", () => {
  it("crea el PaymentIntent con el total y la comisión de computeFees", async () => {
    const res = await post(body());
    expect(res.status).toBe(200);

    const expected = computeFees(PRICE_CENTS * QTY, QTY, "mxn", 0);
    const [params] = h.paymentIntentsCreate.mock.calls[0];
    expect(params).toMatchObject({
      amount: expected.totalCents,
      currency: "mxn",
      application_fee_amount: expected.platformFeeCents,
      transfer_data: { destination: "acct_org_123" },
      receipt_email: "ana@test.mx",
      metadata: { order_id: ORDER_ID, event_id: EVENT_ID },
    });
  });

  it("invariante: amount = neto del organizador + application_fee", async () => {
    await post(body());
    const [params] = h.paymentIntentsCreate.mock.calls[0];
    expect(params.amount).toBe(PRICE_CENTS * QTY + params.application_fee_amount);
  });

  it("el precio sale de la BD, no del cliente", async () => {
    // El cliente intenta colar un precio propio; el body ni siquiera lo acepta,
    // y el total debe seguir la tarifa de la BD (que aquí bajamos a $100).
    setup({ priceCents: 10_000 });
    await post(body({ priceCents: 1, unitPriceCents: 1 }));
    const [params] = h.paymentIntentsCreate.mock.calls[0];
    expect(params.amount).toBe(computeFees(10_000 * QTY, QTY, "mxn", 0).totalCents);
  });

  it("guarda el payment_intent en la orden y devuelve el clientSecret", async () => {
    const res = await post(body());
    const json = await res.json();
    expect(json.clientSecret).toBe("pi_test_123_secret");
    expect(json.orderId).toBe(ORDER_ID);

    const update = h.db.queries.find((q) => q.table === "orders" && q.op === "update");
    expect(update?.payload).toEqual({ stripe_payment_intent_id: "pi_test_123" });
  });

  it("reserva inventario antes de cobrar", async () => {
    await post(body());
    const holds = h.db.rpcCalls.filter((c) => c.fn === "create_hold");
    expect(holds).toHaveLength(1);
    expect(holds[0].args).toMatchObject({ p_ticket_type: TYPE_ID, p_quantity: QTY });
  });

  it("sin stock → 409 y no se cobra", async () => {
    setup({ rpc: { hit_rate_limit: { data: true }, create_hold: { error: { message: "sin stock" } } } });
    const res = await post(body());
    expect(res.status).toBe(409);
    expect(h.paymentIntentsCreate).not.toHaveBeenCalled();
  });
});

// ─── evento gratuito ─────────────────────────────────────────────────────────

describe("checkout — evento gratuito", () => {
  it("no pasa por Stripe y confirma la orden de inmediato", async () => {
    setup({ priceCents: 0, event: { organizations: { stripe_account_id: null, payouts_enabled: false } } });
    const res = await post(body());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ free: true, orderId: ORDER_ID });
    expect(h.paymentIntentsCreate).not.toHaveBeenCalled();
    expect(h.db.rpcCalls.some((c) => c.fn === "confirm_order_paid" && c.args.p_order_id === ORDER_ID)).toBe(true);
  });
});

// ─── cola virtual y presale ──────────────────────────────────────────────────

describe("checkout — control de acceso a la compra", () => {
  it("cola activa sin turno admitido → 403", async () => {
    setup({ event: { queue_enabled: true }, rpc: { hit_rate_limit: { data: true }, is_queue_admitted: { data: false } } });
    const res = await post(body({ queueToken: "token-invalido" }));
    expect(res.status).toBe(403);
    expect(h.paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("presale activa sin código válido → 403", async () => {
    setup({
      event: { presale_enabled: true, presale_ends_at: "2099-01-01T00:00:00Z" },
      rpc: { hit_rate_limit: { data: true }, validate_presale_code: { data: false } },
    });
    const res = await post(body({ presaleCode: "NOPE" }));
    expect(res.status).toBe(403);
  });

  it("presale activa con código válido → deja pasar y consume el código", async () => {
    setup({
      event: { presale_enabled: true, presale_ends_at: "2099-01-01T00:00:00Z" },
      rpc: { hit_rate_limit: { data: true }, validate_presale_code: { data: true } },
    });
    const res = await post(body({ presaleCode: "FAN2026" }));
    expect(res.status).toBe(200);
    expect(h.db.rpcCalls.some((c) => c.fn === "consume_presale_code")).toBe(true);
  });
});
