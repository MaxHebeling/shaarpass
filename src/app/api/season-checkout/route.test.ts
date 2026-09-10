/**
 * Checkout de abonos (season) — CARGO DIRECTO sobre la cuenta del organizador.
 * Protege que el cobro use application_fee = margen (no destination) y respete
 * el gate charges_enabled y el modo absorbido.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeDb, type QueryContext, type FakeDb } from "@/test/fakeSupabase";
import { computeFees } from "@/lib/ticketing/fees";

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  piCreate: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db }));
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({ paymentIntents: { create: h.piCreate, retrieve: vi.fn() } }),
}));

import { POST } from "./route";

const SEASON_ID = "55555555-5555-4555-8555-555555555555";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const ORDER_ID = "44444444-4444-4444-8444-444444444444";
const PRICE = 100000;

function filterVal(ctx: QueryContext, col: string) {
  return ctx.filters.find((f) => f.args[0] === col)?.args[1];
}

function setup(orgOverride: Record<string, unknown> = {}) {
  const org = { stripe_account_id: "acct_org_x", charges_enabled: true, absorb_fees: false, ...orgOverride };
  h.db = createFakeDb({
    rpc: (fn) => (fn === "hit_rate_limit" ? { data: true } : fn === "reserve_season_pass" ? { data: true } : { data: null }),
    tables: (ctx) => {
      if (ctx.table === "orders" && ctx.op === "select") {
        // lookup por idempotency → sin orden previa
        if (filterVal(ctx, "idempotency_key") !== undefined) return { data: null };
        return { data: null };
      }
      if (ctx.table === "orders" && ctx.op === "insert") return { data: { id: ORDER_ID } };
      if (ctx.table === "seasons") return { data: { id: SEASON_ID, org_id: ORG_ID, currency: "mxn", price_cents: PRICE, status: "published", organizations: org } };
      return undefined;
    },
  });
  h.piCreate = vi.fn(async () => ({ id: "pi_season_1", client_secret: "pi_season_1_secret" }));
}

function post(extra: Record<string, unknown> = {}) {
  return POST(new Request("https://www.shaarpass.io/api/season-checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "189.0.0.1" },
    body: JSON.stringify({ seasonId: SEASON_ID, buyerEmail: "ana@test.mx", idempotencyKey: "idem_season_abc", ...extra }),
  }));
}

beforeEach(() => { vi.clearAllMocks(); setup(); });

describe("season-checkout — cargo directo", () => {
  it("crea un CARGO DIRECTO con application_fee = margen (no destination)", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ connectedAccountId: "acct_org_x", orderId: ORDER_ID });
    const expected = computeFees(PRICE, 1, "mxn");
    const [params, opts] = h.piCreate.mock.calls[0];
    expect(params.amount).toBe(expected.totalCents);
    expect(params.application_fee_amount).toBe(expected.applicationFeeCents);
    expect(params.application_fee_amount).toBe(expected.marginCents);
    expect(params.transfer_data).toBeUndefined();
    expect(opts).toMatchObject({ stripeAccount: "acct_org_x", idempotencyKey: "idem_season_abc" });
  });

  it("organizador sin charges_enabled → 409 sin cobrar", async () => {
    setup({ charges_enabled: false });
    const res = await post();
    expect(res.status).toBe(409);
    expect(h.piCreate).not.toHaveBeenCalled();
  });

  it("modo absorbido: comprador paga el precio de lista, application_fee = margen", async () => {
    setup({ absorb_fees: true });
    await post();
    const expected = computeFees(PRICE, 1, "mxn", 0, true);
    const [params] = h.piCreate.mock.calls[0];
    expect(params.amount).toBe(PRICE);
    expect(params.amount).toBe(expected.totalCents);
    expect(params.application_fee_amount).toBe(expected.marginCents);
  });
});
