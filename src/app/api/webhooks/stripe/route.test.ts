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
import { sendBulkEmail } from "@/lib/email/campaigns";

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
  // Doble secreto: webhook de la cuenta + webhook de cuentas conectadas (cargos directos).
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_account";
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_test_connect";
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
  it("pago fallido libera los holds de la orden (release_order_holds)", async () => {
    withEvent({
      type: "payment_intent.payment_failed",
      data: { object: { id: "pi_f", metadata: { order_id: ORDER_ID } } },
    });
    const res = await post("firma-buena");
    expect(res.status).toBe(200);
    // El RPC (service role) libera GA + asientos y marca la orden 'failed'. Idempotente.
    expect(h.db.rpcCalls).toContainEqual({ fn: "release_order_holds", args: { p_order_id: ORDER_ID } });
  });

  it("ficha OXXO vencida (payment_intent.canceled) libera los holds", async () => {
    withEvent({
      type: "payment_intent.canceled",
      data: { object: { id: "pi_c", metadata: { order_id: ORDER_ID } } },
    });
    const res = await post("firma-buena");
    expect(res.status).toBe(200);
    expect(h.db.rpcCalls).toContainEqual({ fn: "release_order_holds", args: { p_order_id: ORDER_ID } });
  });

  it("reventa fallida libera el listing", async () => {
    withEvent({
      type: "payment_intent.payment_failed",
      data: { object: { id: "pi_f", metadata: { kind: "resale", listing_id: "l_9" } } },
    });
    await post("firma-buena");
    expect(h.db.rpcCalls).toContainEqual({ fn: "release_listing", args: { p_listing: "l_9" } });
  });

  it("account.updated: cuenta completa → puede vender, payouts y capabilities sincronizadas", async () => {
    withEvent({
      type: "account.updated",
      data: { object: { id: "acct_1", charges_enabled: true, payouts_enabled: true, details_submitted: true, requirements: {}, capabilities: { oxxo_payments: "active", mx_bank_transfer_payments: "active" } } },
    });
    await post("firma-buena");
    expect(h.db.queries.find((q) => q.table === "organizations")?.payload).toEqual({
      charges_enabled: true, payouts_enabled: true, oxxo_enabled: true, spei_enabled: true,
    });
  });

  it("account.updated: charges ok, payout pendiente y SPEI inactivo → flags correctos", async () => {
    withEvent({
      type: "account.updated",
      data: { object: { id: "acct_1", charges_enabled: true, payouts_enabled: false, details_submitted: true, requirements: { disabled_reason: "requirements.pending_verification" }, capabilities: { oxxo_payments: "active" } } },
    });
    await post("firma-buena");
    expect(h.db.queries.find((q) => q.table === "organizations")?.payload).toEqual({
      charges_enabled: true, payouts_enabled: false, oxxo_enabled: true, spei_enabled: false,
    });
  });

  it("un tipo de evento desconocido se acusa con 200 (no reintentar)", async () => {
    withEvent({ type: "invoice.paid", data: { object: {} } });
    const res = await post("firma-buena");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
  });
});

describe("webhook — OXXO (pago asíncrono)", () => {
  const OXXO_EXPIRES = 1_700_000_000; // unix

  it("ficha emitida (processing) marca 'awaiting', extiende el hold y manda la ficha", async () => {
    withEvent({
      type: "payment_intent.processing",
      data: {
        object: {
          id: "pi_oxxo",
          metadata: { order_id: ORDER_ID },
          next_action: {
            type: "oxxo_display_details",
            oxxo_display_details: { hosted_voucher_url: "https://voucher/oxxo", expires_after: OXXO_EXPIRES },
          },
        },
      },
    });
    const res = await post("firma-buena");
    expect(res.status).toBe(200);

    const call = h.db.rpcCalls.find((c) => c.fn === "mark_order_awaiting_payment");
    expect(call?.args).toMatchObject({
      p_order_id: ORDER_ID,
      p_method: "oxxo",
      p_voucher_url: "https://voucher/oxxo",
      p_expires_at: new Date(OXXO_EXPIRES * 1000).toISOString(),
    });
    // NO emite boletos todavía: el pago aún no entra.
    expect(h.db.rpcCalls.some((c) => c.fn === "confirm_order_paid")).toBe(false);
    expect(sendTicketEmail).not.toHaveBeenCalled();
    // Sí envía la ficha de pago al comprador.
    expect(sendBulkEmail).toHaveBeenCalled();
  });

  it("processing sin next_action reconocido no hace nada", async () => {
    withEvent({
      type: "payment_intent.processing",
      data: { object: { id: "pi_x", metadata: { order_id: ORDER_ID }, next_action: null } },
    });
    const res = await post("firma-buena");
    expect(res.status).toBe(200);
    expect(h.db.rpcCalls.some((c) => c.fn === "mark_order_awaiting_payment")).toBe(false);
  });

  it("OXXO emite la ficha en requires_action (no processing): marca 'awaiting'", async () => {
    // Es el evento REAL que Stripe dispara al emitir la ficha OXXO.
    withEvent({
      type: "payment_intent.requires_action",
      data: {
        object: {
          id: "pi_oxxo2",
          metadata: { order_id: ORDER_ID },
          next_action: {
            type: "oxxo_display_details",
            oxxo_display_details: { hosted_voucher_url: "https://voucher/oxxo2", expires_after: OXXO_EXPIRES },
          },
        },
      },
    });
    const res = await post("firma-buena");
    expect(res.status).toBe(200);
    const call = h.db.rpcCalls.find((c) => c.fn === "mark_order_awaiting_payment");
    expect(call?.args).toMatchObject({ p_order_id: ORDER_ID, p_method: "oxxo", p_voucher_url: "https://voucher/oxxo2" });
    expect(sendBulkEmail).toHaveBeenCalled();
  });

  it("SPEI (display_bank_transfer_instructions) marca 'awaiting' con method=spei", async () => {
    withEvent({
      type: "payment_intent.requires_action",
      data: {
        object: {
          id: "pi_spei",
          metadata: { order_id: ORDER_ID },
          next_action: {
            type: "display_bank_transfer_instructions",
            display_bank_transfer_instructions: { hosted_instructions_url: "https://pay/spei", reference: "349864", type: "mx_bank_transfer" },
          },
        },
      },
    });
    const res = await post("firma-buena");
    expect(res.status).toBe(200);
    const call = h.db.rpcCalls.find((c) => c.fn === "mark_order_awaiting_payment");
    expect(call?.args).toMatchObject({ p_order_id: ORDER_ID, p_method: "spei", p_voucher_url: "https://pay/spei" });
    expect(sendBulkEmail).toHaveBeenCalled();
  });

  it("requires_action de un 3DS de tarjeta NO marca 'awaiting' (guard oxxo)", async () => {
    withEvent({
      type: "payment_intent.requires_action",
      data: {
        object: {
          id: "pi_card_3ds",
          metadata: { order_id: ORDER_ID },
          next_action: { type: "use_stripe_sdk", use_stripe_sdk: {} },
        },
      },
    });
    const res = await post("firma-buena");
    expect(res.status).toBe(200);
    expect(h.db.rpcCalls.some((c) => c.fn === "mark_order_awaiting_payment")).toBe(false);
  });
});

describe("webhook — doble secreto", () => {
  it("verifica con el secreto de cuentas conectadas cuando el de la cuenta no coincide", async () => {
    // El cargo directo llega firmado con el secreto del webhook de cuentas conectadas.
    h.constructEvent = vi.fn(async (_body: string, _sig: string, secret: string) => {
      if (secret !== "whsec_test_connect") throw new Error("No signatures found matching the expected signature");
      return paidEvent();
    });
    const res = await post("firma-de-connect");
    expect(res.status).toBe(200);
    expect(h.db.rpcCalls.some((c) => c.fn === "confirm_order_paid")).toBe(true);
  });
});
