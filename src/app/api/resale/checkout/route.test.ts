/**
 * Checkout de reventa — CARGO DIRECTO sobre la cuenta del VENDEDOR.
 * El dinero no pasa por la plataforma; el vendedor debe estar conectado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeDb, type QueryContext, type FakeDb } from "@/test/fakeSupabase";
import { resaleBuyerTotal } from "@/lib/ticketing/feeMath";

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  piCreate: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db }));
vi.mock("@/lib/stripe/client", () => ({ getStripe: () => ({ paymentIntents: { create: h.piCreate } }) }));

import { POST } from "./route";

const LISTING_ID = "66666666-6666-4666-8666-666666666666";
const PRICE = 60000;

function filterVal(ctx: QueryContext, col: string) {
  return ctx.filters.find((f) => f.args[0] === col)?.args[1];
}

function setup(seller: Record<string, unknown> | null = { stripe_account_id: "acct_seller_x", charges_enabled: true }) {
  h.db = createFakeDb({
    rpc: (fn) => (fn === "hit_rate_limit" ? { data: true } : fn === "reserve_listing" ? { data: true } : { data: null }),
    tables: (ctx) => {
      if (ctx.table === "listings" && ctx.op === "select") {
        return { data: { id: LISTING_ID, price_cents: PRICE, status: "active", seller_email: "vendedor@test.mx", events: { currency: "mxn" } } };
      }
      if (ctx.table === "seller_accounts") return { data: seller };
      return undefined;
    },
  });
  h.piCreate = vi.fn(async () => ({ id: "pi_resale_1", client_secret: "pi_resale_1_secret" }));
}

function post() {
  return POST(new Request("https://www.shaarpass.io/api/resale/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "189.0.0.1" },
    body: JSON.stringify({ listingId: LISTING_ID, buyerEmail: "comprador@test.mx", idempotencyKey: "idem_resale_abc" }),
  }));
}

beforeEach(() => { vi.clearAllMocks(); setup(); });

describe("resale-checkout — cargo directo al vendedor", () => {
  it("cobra en la cuenta del vendedor (sin application_fee, sin transfer)", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ connectedAccountId: "acct_seller_x" });
    const [params, opts] = h.piCreate.mock.calls[0];
    expect(params.amount).toBe(resaleBuyerTotal(PRICE, "mxn"));
    expect(params.application_fee_amount).toBeUndefined(); // plataforma no cobra margen en reventa
    expect(params.transfer_data).toBeUndefined();
    expect(opts).toMatchObject({ stripeAccount: "acct_seller_x", idempotencyKey: "idem_resale_abc" });
  });

  it("vendedor sin cuenta conectada habilitada → 409 sin cobrar", async () => {
    setup({ stripe_account_id: "acct_seller_x", charges_enabled: false });
    const res = await post();
    expect(res.status).toBe(409);
    expect(h.piCreate).not.toHaveBeenCalled();
  });

  it("vendedor sin cuenta → 409", async () => {
    setup(null);
    const res = await post();
    expect(res.status).toBe(409);
    expect(h.piCreate).not.toHaveBeenCalled();
  });
});
