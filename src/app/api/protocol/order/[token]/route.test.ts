/**
 * Enlace del comprador: completa/corrige acompañantes sin recomprar, solo sobre SU
 * compra, respetando check-in, fecha límite y boletos inactivos.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMemoryDb, type Tables } from "@/test/memoryDb";
import type { FakeDb } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb & { tables: Tables }, enabled: true }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db }));
vi.mock("@/lib/rateLimit", () => ({
  rateLimit: async () => ({ ok: true, backend: "none", retryAfterSeconds: 1 }),
  clientIp: () => "1.1.1.1", retryAfterHeaders: () => ({}),
}));

import { GET, PUT } from "./route";

const TOKEN = "d".repeat(64);
const EV = "e0000000-0000-4000-8000-000000000001";
const MINE_1 = "a1000000-0000-4000-8000-000000000001";
const MINE_2 = "a1000000-0000-4000-8000-000000000002";
const MINE_IN = "a1000000-0000-4000-8000-000000000003";
const THEIRS = "a1000000-0000-4000-8000-000000000009";

function person(id: string, order: string, extra: Record<string, unknown> = {}, ticketStatus = "valid") {
  return {
    id, order_id: order, event_id: EV, kind: "ticket", ticket_id: `t-${id}`, full_name: null, email: null, phone: null, city: "Saltillo",
    category: null, relation: null, is_pastor: null, coverage_claim: null, coverage_status: "not_applicable", confirmation_status: "pending",
    access_category: null, badge: null, admin_notes: "NOTA PRIVADA", tickets: { status: ticketStatus, checked_in_at: null },
    orders: { buyer_name: "Pastor Eleonardo Martínez", buyer_email: "eleonardo@x.mx" }, ...extra,
  };
}

function world(settings: Record<string, unknown> = {}) {
  h.enabled = true;
  h.db = createMemoryDb({
    protocol_orders: [
      { order_id: "o1", event_id: EV, access_token: TOKEN, accompanied: null },
      { order_id: "o2", event_id: EV, access_token: "e".repeat(64), accompanied: null },
    ],
    protocol_event_settings: [{ event_id: EV, enabled: true, companions_enabled: true, coverage_enabled: true, coverage_leader: "Jorge Pompa", edit_deadline: null, lock_after_checkin: true, ...settings }],
    events: [{ id: EV, title: "RAF", starts_at: "2026-11-14T01:30:00Z", timezone: "America/Tijuana", cover_image: null, slug: "raf" }],
    protocol_people: [
      person(MINE_1, "o1", { full_name: "Pastor Eleonardo Martínez", category: "holder" }),
      person(MINE_2, "o1"),
      person(MINE_IN, "o1", { full_name: "Líder X" }, "checked_in"),
      person(THEIRS, "o2", { full_name: "Persona de otra compra" }),
    ],
  }, (fn) => (fn === "protocol_enabled_for_event" ? { data: h.enabled } : fn === "protocol_sync_order" ? { data: TOKEN } : { data: null }));
}

const get = (t = TOKEN) => GET(new Request(`https://x/api/protocol/order/${t}`), { params: Promise.resolve({ token: t }) });
const put = (body: unknown, t = TOKEN) => PUT(new Request(`https://x/api/protocol/order/${t}`, { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ token: t }) });
const row = (id: string) => h.db.tables.protocol_people.find((p) => p.id === id)!;
const peopleWrites = () => h.db.queries.filter((q) => q.table === "protocol_people" && q.op === "update");

beforeEach(() => { vi.clearAllMocks(); world(); });

describe("acceso por enlace", () => {
  it("token mal formado o desconocido → 404", async () => {
    expect((await get("abc")).status).toBe(404);
    expect((await get("f".repeat(64))).status).toBe(404);
  });

  it("si el evento ya no tiene el módulo → 404", async () => {
    h.enabled = false;
    expect((await get()).status).toBe(404);
  });

  it("solo devuelve SUS boletos y nada administrativo", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.people.map((p: { id: string }) => p.id)).toEqual([MINE_1, MINE_2, MINE_IN]);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("NOTA PRIVADA");
    expect(raw).not.toContain("Persona de otra compra");
    expect(raw).not.toContain("eleonardo@x.mx");
  });
});

describe("registro y sustitución de acompañantes", () => {
  it("registra a la esposa y luego la sustituye por un líder, sin recomprar (mismo boleto)", async () => {
    let res = await put({ people: [{ id: MINE_2, full_name: "María López", category: "spouse", relation: "Esposa" }] });
    expect(res.status).toBe(200);
    expect(row(MINE_2)).toMatchObject({ full_name: "María López", category: "spouse", updated_by_kind: "buyer", ticket_id: `t-${MINE_2}` });
    res = await put({ people: [{ id: MINE_2, full_name: "Pedro Ramírez", category: "leader", relation: "Líder" }] });
    expect(res.status).toBe(200);
    expect(row(MINE_2)).toMatchObject({ full_name: "Pedro Ramírez", category: "leader", ticket_id: `t-${MINE_2}`, order_id: "o1" });
    expect(h.db.queries.some((q) => (q.table === "orders" || q.table === "tickets") && q.op !== "select")).toBe(false);
  });

  it("no puede tocar asistentes de otra compra (acceso horizontal) → 403 sin escrituras", async () => {
    const res = await put({ people: [{ id: THEIRS, full_name: "Hackeado" }] });
    expect(res.status).toBe(403);
    expect(row(THEIRS).full_name).toBe("Persona de otra compra");
    expect(peopleWrites()).toHaveLength(0);
  });

  it("no puede autoconfirmarse la cobertura (campo administrativo ignorado)", async () => {
    await put({ people: [{ id: MINE_1, full_name: "Pastor Eleonardo Martínez", is_pastor: true, coverage_claim: "yes", coverage_status: "confirmed", coverage_reviewed_by: "x" }] });
    const r = row(MINE_1);
    expect(r.coverage_claim).toBe("yes");
    expect(r.coverage_status).toBe("not_applicable"); // la BD lo pasa a 'pending'; nunca a 'confirmed'
    expect(r).not.toHaveProperty("coverage_reviewed_by");
  });

  it("tras el check-in el comprador ya no puede cambiar a ese asistente", async () => {
    const res = await put({ people: [{ id: MINE_IN, full_name: "Otra persona" }] });
    expect(res.status).toBe(409);
    expect(row(MINE_IN).full_name).toBe("Líder X");
  });

  it("respeta la fecha límite de modificaciones del evento", async () => {
    world({ edit_deadline: "2020-01-01T00:00:00Z" });
    const res = await put({ people: [{ id: MINE_2, full_name: "Tarde" }] });
    expect(res.status).toBe(409);
    expect(row(MINE_2).full_name).toBeNull();
  });

  it("boletos reembolsados no se pueden asignar", async () => {
    row(MINE_2).tickets = { status: "refunded", checked_in_at: null };
    expect((await put({ people: [{ id: MINE_2, full_name: "X Y" }] })).status).toBe(409);
  });

  it("ids repetidos o payload inválido → 400", async () => {
    expect((await put({ people: [{ id: MINE_2, full_name: "A B" }, { id: MINE_2, full_name: "C D" }] })).status).toBe(400);
    expect((await put({ people: "nope" })).status).toBe(400);
    expect((await put({ people: [{ id: MINE_2, email: "no-es-correo" }] })).status).toBe(400);
  });

  it("guarda '¿Asistirá acompañado?'", async () => {
    await put({ accompanied: "tbd", people: [] });
    expect(h.db.tables.protocol_orders[0].accompanied).toBe("tbd");
  });
});
