import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({ create: vi.fn(), token: "seller-token" as string | null }));
vi.mock("@/lib/stripe/client", () => ({ getStripe: () => ({ refunds: { create: h.create } }) }));
vi.mock("@/lib/mp/client", () => ({ getSellerToken: async () => h.token }));

import { refundOrderPayment } from "./refund";

const stripeErr = (code: string, message = code) => Object.assign(new Error(message), { code, raw: { code, message } });

beforeEach(() => { h.create.mockReset(); h.token = "seller-token"; });
afterEach(() => vi.unstubAllGlobals());

describe("reembolso Stripe (cargos directos)", () => {
  it("se crea en la cuenta conectada del organizador, con idempotency key", async () => {
    h.create.mockResolvedValue({ id: "re_1" });
    expect(await refundOrderPayment({ paymentId: "pi_1", stripeAccountId: "acct_org", orgId: "o" })).toEqual({ ok: true });
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create).toHaveBeenCalledWith({ payment_intent: "pi_1" }, { stripeAccount: "acct_org", idempotencyKey: "refund_pi_1" });
  });

  it("cargo antiguo en la plataforma: si la cuenta conectada no lo conoce, reintenta en la plataforma", async () => {
    h.create.mockRejectedValueOnce(stripeErr("resource_missing", "No such payment_intent")).mockResolvedValueOnce({ id: "re_2" });
    expect(await refundOrderPayment({ paymentId: "pi_old", stripeAccountId: "acct_org", orgId: "o" })).toEqual({ ok: true });
    expect(h.create.mock.calls[1]).toEqual([{ payment_intent: "pi_old" }, { idempotencyKey: "refund_pi_old" }]);
  });

  it("ya reembolsado → ok (idempotente)", async () => {
    h.create.mockRejectedValue(stripeErr("charge_already_refunded"));
    expect(await refundOrderPayment({ paymentId: "pi_1", stripeAccountId: "acct_org", orgId: "o" })).toEqual({ ok: true, alreadyRefunded: true });
  });

  it("otro error de Stripe se reporta sin reintentar en la plataforma", async () => {
    h.create.mockRejectedValue(stripeErr("balance_insufficient", "Saldo insuficiente"));
    expect(await refundOrderPayment({ paymentId: "pi_1", stripeAccountId: "acct_org", orgId: "o" })).toEqual({ ok: false, error: "Stripe: Saldo insuficiente" });
    expect(h.create).toHaveBeenCalledTimes(1);
  });

  it("sin pago (cortesía / venta en puerta) no llama a ninguna pasarela", async () => {
    expect(await refundOrderPayment({ paymentId: null, stripeAccountId: "acct_org", orgId: "o" })).toEqual({ ok: true });
    expect(h.create).not.toHaveBeenCalled();
  });
});

describe("reembolso Mercado Pago", () => {
  it("usa el token del vendedor y el id real del pago (sin el prefijo mp_)", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await refundOrderPayment({ paymentId: "mp_123", stripeAccountId: null, orgId: "o" })).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.mercadopago.com/v1/payments/123/refunds");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer seller-token");
    expect((init.headers as Record<string, string>)["X-Idempotency-Key"]).toBe("refund_123");
    expect(h.create).not.toHaveBeenCalled();
  });

  it("sin Mercado Pago conectado → error claro", async () => {
    h.token = null;
    expect(await refundOrderPayment({ paymentId: "mp_123", stripeAccountId: null, orgId: "o" })).toMatchObject({ ok: false });
  });

  it("error de la API se reporta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "invalid status" }), { status: 400 })));
    expect(await refundOrderPayment({ paymentId: "mp_9", stripeAccountId: null, orgId: "o" })).toEqual({ ok: false, error: "Mercado Pago: invalid status" });
  });
});
