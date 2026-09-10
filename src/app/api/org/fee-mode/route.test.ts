/**
 * Ruta que cambia el modelo de comisión del organizador. Protege que solo se
 * actualice la org del usuario (vía getUserOrg + RLS) y valida el payload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeDb, type FakeDb } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  org: null as unknown as { id: string } | null,
  updateError: null as unknown as { message: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.db }));
vi.mock("@/lib/org", () => ({ getUserOrg: async () => h.org }));

import { POST } from "./route";

const ORG_ID = "33333333-3333-4333-8333-333333333333";

function setup() {
  h.org = { id: ORG_ID };
  h.updateError = null;
  h.db = createFakeDb({
    tables: (ctx) => {
      if (ctx.table === "organizations" && ctx.op === "update") {
        return h.updateError ? { error: h.updateError } : { data: null };
      }
      return undefined;
    },
  });
}

function post(payload: unknown) {
  return POST(new Request("https://www.shaarpass.io/api/org/fee-mode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

beforeEach(() => { vi.clearAllMocks(); setup(); });

describe("fee-mode", () => {
  it("activa el modo absorbido y actualiza SOLO la org del usuario", async () => {
    const res = await post({ absorb: true });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, absorb_fees: true });
    const upd = h.db.queries.find((q) => q.table === "organizations" && q.op === "update");
    expect(upd?.payload).toEqual({ absorb_fees: true });
    expect(upd?.filters).toEqual([{ method: "eq", args: ["id", ORG_ID] }]);
  });

  it("desactiva (vuelve al modelo por defecto)", async () => {
    const res = await post({ absorb: false });
    expect(res.status).toBe(200);
    const upd = h.db.queries.find((q) => q.table === "organizations" && q.op === "update");
    expect(upd?.payload).toEqual({ absorb_fees: false });
  });

  it("payload inválido → 400 sin tocar la BD", async () => {
    const res = await post({ absorb: "sí" });
    expect(res.status).toBe(400);
    expect(h.db.queries.some((q) => q.op === "update")).toBe(false);
  });

  it("sin organización → 401", async () => {
    h.org = null;
    const res = await post({ absorb: true });
    expect(res.status).toBe(401);
  });

  it("si la RLS/BD rechaza → 403", async () => {
    h.updateError = { message: "no autorizado" };
    const res = await post({ absorb: true });
    expect(res.status).toBe(403);
  });
});
