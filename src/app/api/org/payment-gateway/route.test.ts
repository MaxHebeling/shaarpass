import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeDb, type FakeDb } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  org: null as unknown as { id: string; mp_connected: boolean } | null,
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.db }));
vi.mock("@/lib/org", () => ({ getUserOrg: async () => h.org }));

import { POST } from "./route";

const ORG = "33333333-3333-4333-8333-333333333333";

function post(body: unknown) {
  return POST(new Request("https://www.shaarpass.io/api/org/payment-gateway", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.org = { id: ORG, mp_connected: true };
  h.db = createFakeDb({ tables: () => ({ data: null }) });
});

describe("payment-gateway", () => {
  it("cambia a stripe", async () => {
    const res = await post({ gateway: "stripe" });
    expect(res.status).toBe(200);
    const upd = h.db.queries.find((q) => q.table === "organizations" && q.op === "update");
    expect(upd?.payload).toEqual({ payment_gateway: "stripe" });
  });

  it("cambia a mercadopago si está conectado", async () => {
    const res = await post({ gateway: "mercadopago" });
    expect(res.status).toBe(200);
    expect(h.db.queries.find((q) => q.op === "update")?.payload).toEqual({ payment_gateway: "mercadopago" });
  });

  it("mercadopago sin conectar → 409 sin actualizar", async () => {
    h.org = { id: ORG, mp_connected: false };
    const res = await post({ gateway: "mercadopago" });
    expect(res.status).toBe(409);
    expect(h.db.queries.some((q) => q.op === "update")).toBe(false);
  });

  it("valor inválido → 400", async () => {
    expect((await post({ gateway: "paypal" })).status).toBe(400);
  });

  it("sin organización → 401", async () => {
    h.org = null;
    expect((await post({ gateway: "stripe" })).status).toBe(401);
  });
});
