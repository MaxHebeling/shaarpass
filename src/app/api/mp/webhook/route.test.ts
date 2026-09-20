import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeDb, type FakeDb } from "@/test/fakeSupabase";
import { sendTicketEmail } from "@/lib/email/tickets";

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  token: "APP_USR-seller" as string | null,
  payment: { status: "approved", external_reference: "ORD1" } as { status: string; external_reference: string | null } | null,
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db }));
vi.mock("@/lib/email/tickets", () => ({ sendTicketEmail: vi.fn(async () => undefined) }));
vi.mock("@/lib/email/campaignSend", () => ({ sendWelcome: vi.fn(async () => undefined) }));
vi.mock("@/lib/mp/client", () => ({
  getSellerToken: async () => h.token,
  getPayment: async () => h.payment,
}));

import { GET } from "./route";

const ORG = "0d6dd1ba-7814-41b5-9d5e-61f95d999922";

function setup(rpc?: Record<string, { data?: unknown; error?: unknown }>) {
  h.token = "APP_USR-seller";
  h.payment = { status: "approved", external_reference: "ORD1" };
  h.db = createFakeDb({
    rpc: (fn) => rpc?.[fn] ?? { data: null },
    tables: (ctx) => {
      if (ctx.table === "orders") return { data: { buyer_email: "ana@test.mx", event_id: "EV", total_cents: 120000, currency: "mxn", events: { title: "Demo", slug: "demo" }, organizations: { name: "Org" } } };
      if (ctx.table === "tickets") return { data: [{ qr_token: "qr_1", ticket_types: { name: "General" } }] };
      return undefined;
    },
  });
}

function hit(qs: string) {
  return GET(new Request(`https://www.shaarpass.io/api/mp/webhook?${qs}`));
}

beforeEach(() => { vi.clearAllMocks(); setup(); });

describe("mp/webhook", () => {
  it("pago aprobado → confirma la orden y emite boletos por correo", async () => {
    const res = await hit(`org=${ORG}&type=payment&data.id=PAY123`);
    expect(res.status).toBe(200);
    expect(h.db.rpcCalls).toContainEqual({ fn: "confirm_order_paid", args: { p_order_id: "ORD1", p_payment_intent_id: "mp_PAY123" } });
    expect(sendTicketEmail).toHaveBeenCalledTimes(1);
  });

  it("si confirm_order_paid falla → 500 (MP reintenta)", async () => {
    setup({ confirm_order_paid: { error: { message: "deadlock" } } });
    const res = await hit(`org=${ORG}&type=payment&data.id=PAY123`);
    expect(res.status).toBe(500);
  });

  it("pago rechazado → libera el inventario", async () => {
    h.payment = { status: "rejected", external_reference: "ORD1" };
    await hit(`org=${ORG}&type=payment&data.id=PAY9`);
    expect(h.db.rpcCalls).toContainEqual({ fn: "release_order_holds", args: { p_order_id: "ORD1" } });
  });

  it("org sin Mercado Pago conectado → 200 y no hace nada", async () => {
    h.token = null;
    const res = await hit(`org=${ORG}&type=payment&data.id=PAY123`);
    expect(res.status).toBe(200);
    expect(h.db.rpcCalls.length).toBe(0);
  });

  it("notificación sin org → 200 (ignora)", async () => {
    const res = await hit("type=payment&data.id=PAY123");
    expect(res.status).toBe(200);
  });
});
