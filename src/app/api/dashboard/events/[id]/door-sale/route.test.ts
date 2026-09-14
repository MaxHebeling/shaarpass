/**
 * Venta en puerta — emite un boleto para un pago cobrado por fuera. Solo miembros
 * de la org; reutiliza confirm_order_paid (respeta cupo).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeDb, type FakeDb } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({
  user: null as null | { id: string },
  db: null as unknown as FakeDb,
  member: null as unknown as { user_id: string } | null,
  ticketType: null as unknown as { id: string; event_id: string; is_seated: boolean } | null,
  confirm: { data: null } as { data?: unknown; error?: unknown },
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db }));

import { POST } from "./route";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const TYPE_ID = "22222222-2222-4222-8222-222222222222";
const ORDER_ID = "44444444-4444-4444-8444-444444444444";

function setup() {
  h.user = { id: "user-1" };
  h.member = { user_id: "user-1" };
  h.ticketType = { id: TYPE_ID, event_id: EVENT_ID, is_seated: false };
  h.confirm = { data: null };
  h.db = createFakeDb({
    rpc: (fn) => (fn === "confirm_order_paid" ? h.confirm : { data: null }),
    tables: (ctx) => {
      if (ctx.table === "events") return { data: { id: EVENT_ID, org_id: ORG_ID, currency: "mxn" } };
      if (ctx.table === "org_members") return { data: h.member };
      if (ctx.table === "ticket_types") return { data: h.ticketType };
      if (ctx.table === "orders" && ctx.op === "insert") return { data: { id: ORDER_ID } };
      if (ctx.table === "tickets") return { data: { qr_token: "qr_door_1" } };
      return undefined;
    },
  });
}

function post(body: Record<string, unknown> = {}) {
  return POST(new Request(`https://www.shaarpass.io/api/dashboard/events/${EVENT_ID}/door-sale`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ticketTypeId: TYPE_ID, buyerName: "Juan Pérez", amountCents: 200000, method: "efectivo", ...body }),
  }), { params: Promise.resolve({ id: EVENT_ID }) });
}

beforeEach(() => { vi.clearAllMocks(); setup(); });

describe("door-sale", () => {
  it("miembro + boleto GA → emite boleto (confirm_order_paid) y devuelve el token", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, ticketToken: "qr_door_1" });
    expect(h.db.rpcCalls.some((c) => c.fn === "confirm_order_paid" && c.args.p_order_id === ORDER_ID)).toBe(true);
    const order = h.db.queries.find((q) => q.table === "orders" && q.op === "insert");
    expect(order?.payload).toMatchObject({ platform_fee_cents: 0, total_cents: 200000, payment_method: "puerta-efectivo" });
  });

  it("boleto con asiento → 400 (se venden desde el mapa)", async () => {
    h.ticketType = { id: TYPE_ID, event_id: EVENT_ID, is_seated: true };
    const res = await post();
    expect(res.status).toBe(400);
    expect(h.db.rpcCalls.some((c) => c.fn === "confirm_order_paid")).toBe(false);
  });

  it("sin cupo (confirm_order_paid falla) → 409 y limpia la orden", async () => {
    h.confirm = { error: { message: "overselling evitado en X" } };
    const res = await post();
    expect(res.status).toBe(409);
    expect(h.db.queries.some((q) => q.table === "orders" && q.op === "delete")).toBe(true);
  });

  it("no miembro → 403", async () => {
    h.member = null;
    expect((await post()).status).toBe(403);
  });

  it("sin sesión → 401", async () => {
    h.user = null;
    expect((await post()).status).toBe(401);
  });
});
