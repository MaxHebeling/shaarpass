/**
 * Cobertura del webhook de Stripe (sin red).
 *
 * Es la mitad que faltaba del flujo de pago: aquí se emiten los boletos. Lo que
 * se protege: que un webhook sin firma no entre, que un pago exitoso confirme la
 * orden de forma idempotente, y que un fallo del RPC devuelva 500 para que
 * Stripe reintente en lugar de perder la venta en silencio.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeDb, type FakeDb } from "@/test/fakeSupabase";
import { sendTicketEmail } from "@/lib/email/tickets";

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  constructEvent: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db }));
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({ webhooks: { constructEventAsync: h.constructEvent } }),
}));
vi.mock("@/lib/email/tickets", () => ({ sendTicketEmail: vi.fn(async () => undefined) }));
vi.mock("@/lib/email/campaignSend", () => ({ sendWelcome: vi.fn(async () => undefined) }));
vi.mock("@/lib/email/campaigns", () => ({ sendBulkEmail: vi.fn(async () => undefined) }));
vi.mock("@/lib/resale/payout", () => ({ processPayout: vi.fn(async () => undefined) }));

import { POST } from "./route";

const ORDER_ID = "44444444-4444-4444-8444-444444444444";

function setup(o: { rpc?: Record<string, { data?: unknown; error?: unknown }>; tickets?: unknown[] } = {}) {
  h.db = createFakeDb({
    rpc: (fn) => o.rpc?.[fn] ?? { data: null },
    tables: (ctx) => {
      if (ctx.table === "orders" && ctx.op === "select") {
        return {
          data: {
            buyer_email: "ana@test.mx",
            buyer_name: "Ana López",
            buyer_country: "México",
            event_id: "11111111-1111-4111-8111-111111111111",
            total_cents: 53_320,
            currency: "mxn",
            events: { title: "Concierto", slug: "concierto", cover_image: null, starts_at: "2026-09-01T02:00:00Z", timezone: "America/Mexico_City", safetix_enabled: true },
            organizations: { name: "Org", logo_url: null, white_label: false },
          },
        };
      }
      if (ctx.table === "tickets") return { data: o.tickets ?? [{ qr_token: "qr_1", ticket_types: { name: "General" } }] };
      return undefined;
    },
  });
}

/** Simula la verificación de firma de Stripe: firma "buena" ⇒ devuelve el evento. */
function withEvent(event: unknown) {
  h.constructEvent = vi.fn(async (_body: string, sig: string) => {
    if (sig !== "firma-buena") throw new Error("No signatures found matching the expected signature");
    return event;
  });
}

function post(sig: string | null, payload: unknown = { hola: "mundo" }) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sig !== null) headers["stripe-signature"] = sig;
  return POST(
    new Request("https://www.shaarpass.io/api/webhooks/stripe", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }),
  );
}

const paidEvent = (metadata: Record<string, string> = { order_id: ORDER_ID }) => ({
  type: "payment_intent.succeeded",
  data: { object: { id: "pi_test_123", metadata } },
});

beforeEach(() => {
  vi.clearAllMocks();
  setup();
  withEvent(paidEvent());
});

describe("webhook — verificación de firma", () => {
  it("sin cabecera stripe-signature → 400 y no toca la BD", async () => {
    const res = await post(null);
    expect(res.status).toBe(400);
    expect(h.db.rpcCalls).toHaveLength(0);
  });

  it("firma inválida → 400", async () => {
    const res = await post("firma-falsa");
    expect(res.status).toBe(400);
    expect(h.db.rpcCalls).toHaveLength(0);
  });
});

describe("webhook — pago exitoso", () => {
  it("confirma la orden con el payment_intent y emite los boletos por correo", async () => {
    const res = await post("firma-buena");
    expect(res.status).toBe(200);
    expect(h.db.rpcCalls).toContainEqual({
      fn: "confirm_order_paid",
      args: { p_order_id: ORDER_ID, p_payment_intent_id: "pi_test_123" },
    });
    expect(sendTicketEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendTicketEmail).mock.calls[0][0]).toMatchObject({
      to: "ana@test.mx",
      eventTitle: "Concierto",
      currency: "mxn",
      totalCents: 53_320,
      tickets: [{ qr_token: "qr_1", typeName: "General" }],
    });
  });

  it("webhook duplicado sigue devolviendo 200 (confirm_order_paid es idempotente)", async () => {
    expect((await post("firma-buena")).status).toBe(200);
    expect((await post("firma-buena")).status).toBe(200);
    expect(h.db.rpcCalls.filter((c) => c.fn === "confirm_order_paid")).toHaveLength(2);
  });

  it("si el RPC falla → 500 para que Stripe reintente (no se pierde la venta)", async () => {
    setup({ rpc: { confirm_order_paid: { error: { message: "deadlock" } } } });
    const res = await post("firma-buena");
    expect(res.status).toBe(500);
    expect(sendTicketEmail).not.toHaveBeenCalled();
  });

  it("sin boletos emitidos no manda correo vacío", async () => {
    setup({ tickets: [] });
    const res = await post("firma-buena");
    expect(res.status).toBe(200);
    expect(sendTicketEmail).not.toHaveBeenCalled();
  });

  it("un PaymentIntent sin order_id no rompe nada", async () => {
    withEvent(paidEvent({}));
    const res = await post("firma-buena");
    expect(res.status).toBe(200);
    expect(h.db.rpcCalls.some((c) => c.fn === "confirm_order_paid")).toBe(false);
  });
});

describe("webhook — reventa y abonos", () => {
  it("reventa: transfiere el boleto al comprador", async () => {
    withEvent({
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_r", metadata: { kind: "resale", listing_id: "l_1", buyer_email: "beto@test.mx" } } },
    });
    const res = await post("firma-buena");
    expect(res.status).toBe(200);
    expect(h.db.rpcCalls).toContainEqual({ fn: "buy_listing", args: { p_listing: "l_1", p_buyer_email: "beto@test.mx" } });
    expect(sendTicketEmail).not.toHaveBeenCalled();
  });

  it("abono: si confirm_season_pass falla → 500", async () => {
    withEvent({
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_s", metadata: { kind: "season", order_id: ORDER_ID } } },
    });
    setup({ rpc: { confirm_season_pass: { error: { message: "sin cupo" } } } });
    const res = await post("firma-buena");
    expect(res.status).toBe(500);
  });
});

describe("webhook — pago fallido y Connect", () => {
  it("pago fallido marca la orden como failed (solo si seguía pending)", async () => {
    withEvent({
      type: "payment_intent.payment_failed",
      data: { object: { id: "pi_f", metadata: { order_id: ORDER_ID } } },
    });
    const res = await post("firma-buena");
    expect(res.status).toBe(200);
    const upd = h.db.queries.find((q) => q.table === "orders" && q.op === "update");
    expect(upd?.payload).toEqual({ status: "failed" });
    expect(upd?.filters).toEqual([
      { method: "eq", args: ["id", ORDER_ID] },
      { method: "eq", args: ["status", "pending"] },
    ]);
  });

  it("reventa fallida libera el listing", async () => {
    withEvent({
      type: "payment_intent.payment_failed",
      data: { object: { id: "pi_f", metadata: { kind: "resale", listing_id: "l_9" } } },
    });
    await post("firma-buena");
    expect(h.db.rpcCalls).toContainEqual({ fn: "release_listing", args: { p_listing: "l_9" } });
  });

  it("account.updated habilita pagos solo si la cuenta está completa", async () => {
    withEvent({
      type: "account.updated",
      data: { object: { id: "acct_1", charges_enabled: true, payouts_enabled: true, details_submitted: true, requirements: {} } },
    });
    await post("firma-buena");
    expect(h.db.queries.find((q) => q.table === "organizations")?.payload).toEqual({ payouts_enabled: true });
  });

  it("account.updated con requisitos pendientes deshabilita pagos", async () => {
    withEvent({
      type: "account.updated",
      data: { object: { id: "acct_1", charges_enabled: true, payouts_enabled: true, details_submitted: true, requirements: { disabled_reason: "requirements.past_due" } } },
    });
    await post("firma-buena");
    expect(h.db.queries.find((q) => q.table === "organizations")?.payload).toEqual({ payouts_enabled: false });
  });

  it("un tipo de evento desconocido se acusa con 200 (no reintentar)", async () => {
    withEvent({ type: "invoice.paid", data: { object: {} } });
    const res = await post("firma-buena");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
  });
});
