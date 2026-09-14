/**
 * Export CSV de asistentes — solo miembros de la org del evento; una fila por boleto.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeDb, type FakeDb } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({
  user: null as null | { id: string },
  db: null as unknown as FakeDb,
  member: null as unknown as { user_id: string } | null,
  tickets: [] as unknown[],
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db }));

import { GET } from "./route";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "33333333-3333-4333-8333-333333333333";

function setup() {
  h.user = { id: "user-1" };
  h.member = { user_id: "user-1" };
  h.tickets = [{
    status: "checked_in", checked_in_at: "2026-12-03T20:00:00Z",
    ticket_types: { name: "Preventa" },
    attendees: { first_name: "Ana", last_name: 'Lo"pez', email: "ana@test.mx" },
    orders: { buyer_name: "Ana", buyer_email: "ana@test.mx", buyer_phone: "+52 55 1234", buyer_city: "CDMX", buyer_country: "Mexico", paid_at: "2026-11-01T00:00:00Z", payment_method: "oxxo" },
  }];
  h.db = createFakeDb({
    tables: (ctx) => {
      if (ctx.table === "events") return { data: { id: EVENT_ID, slug: "evento-x", org_id: ORG_ID } };
      if (ctx.table === "org_members") return { data: h.member };
      if (ctx.table === "tickets") return { data: h.tickets };
      return undefined;
    },
  });
}

function get() {
  return GET(new Request(`https://www.shaarpass.io/api/dashboard/events/${EVENT_ID}/attendees`), { params: Promise.resolve({ id: EVENT_ID }) });
}

beforeEach(() => { vi.clearAllMocks(); setup(); });

describe("attendees CSV", () => {
  it("miembro autorizado → CSV con encabezado y fila (comillas escapadas)", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("asistentes-evento-x.csv");
    const body = await res.text();
    expect(body).toContain("Nombre");
    expect(body).toContain("Preventa");
    expect(body).toContain("ana@test.mx");
    expect(body).toContain('"Ana Lo""pez"'); // comilla interna escapada
    expect(body).toContain("Registrado");
  });

  it("sin sesión → 401", async () => {
    h.user = null;
    expect((await get()).status).toBe(401);
  });

  it("no miembro de la org → 403", async () => {
    h.member = null;
    expect((await get()).status).toBe(403);
  });
});
