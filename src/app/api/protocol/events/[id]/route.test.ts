/**
 * API administrativa de Protocolo — PRUEBA CRÍTICA de aislamiento multitenant y
 * permisos por rol. Se prueban llamadas directas y manipuladas, no la interfaz.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMemoryDb, type Tables } from "@/test/memoryDb";
import type { FakeDb } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ user: null as null | { id: string }, db: null as unknown as FakeDb & { tables: Tables } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db }));

import { GET, POST } from "./route";
import { GET as EXPORT } from "./export/route";

const FDV = "f0000000-0000-4000-8000-000000000001";
const OTHER = "f0000000-0000-4000-8000-000000000002";
const EV = "e0000000-0000-4000-8000-000000000001";        // evento de Fuente de Vida
const EV2 = "e0000000-0000-4000-8000-000000000002";       // otro evento de FdV (módulo apagado)
const EV_OTHER = "e0000000-0000-4000-8000-000000000003";  // evento de otro tenant
const P1 = "a1000000-0000-4000-8000-000000000001";
const P_OTHER_EVENT = "a1000000-0000-4000-8000-000000000002";
const T1 = "b1000000-0000-4000-8000-000000000001";
const T_EV2 = "b1000000-0000-4000-8000-000000000002";
const U = { admin: "u-admin", staff: "u-staff", scanner: "u-scan", otherOwner: "u-other" };

function world() {
  const settings = (event_id: string, enabled: boolean) => ({
    event_id, org_id: FDV, enabled, companions_enabled: true, coverage_enabled: true, coverage_leader: "Jorge Pompa",
    meals_enabled: true, tables_enabled: true, guests_enabled: true, edit_deadline: null, lock_after_checkin: true,
  });
  h.db = createMemoryDb({
    events: [
      { id: EV, org_id: FDV, slug: "raf", title: "RAF", starts_at: "2026-11-14T01:30:00Z", timezone: "America/Tijuana", currency: "mxn" },
      { id: EV2, org_id: FDV, slug: "escuela", title: "Escuela", starts_at: "2026-12-12T02:00:00Z", timezone: "America/Tijuana", currency: "mxn" },
      { id: EV_OTHER, org_id: OTHER, slug: "concierto", title: "Concierto", starts_at: "2026-12-01T02:00:00Z", timezone: "America/Mexico_City", currency: "mxn" },
    ],
    org_members: [
      { org_id: FDV, user_id: U.admin, role: "admin" }, { org_id: FDV, user_id: U.staff, role: "staff" },
      { org_id: FDV, user_id: U.scanner, role: "scanner" }, { org_id: OTHER, user_id: U.otherOwner, role: "owner" },
    ],
    org_features: [{ org_id: FDV, feature: "protocol", enabled: true }],
    protocol_event_settings: [settings(EV, true), settings(EV2, false)],
    protocol_people: [
      { id: P1, event_id: EV, org_id: FDV, kind: "ticket", ticket_id: "tk1", order_id: "o1", full_name: "Pastor Juan Pérez", coverage_claim: "yes", coverage_status: "pending", is_pastor: true,
        tickets: { status: "valid", checked_in_at: null }, orders: { buyer_name: "Pastor Juan Pérez", buyer_email: "juan@x.mx" } },
      { id: P_OTHER_EVENT, event_id: EV2, org_id: FDV, kind: "guest", ticket_id: null, full_name: "Otro evento" },
    ],
    protocol_tables: [{ id: T1, event_id: EV, org_id: FDV, name: "Mesa 01", capacity: 8 }, { id: T_EV2, event_id: EV2, org_id: FDV, name: "Mesa X", capacity: 8 }],
    tickets: [{ id: "tk1", status: "valid" }],
    orders: [{ id: "o1", event_id: EV }],
  }, (fn) => (fn === "protocol_assign_table" ? { data: "ok" } : fn === "protocol_sync_order" ? { data: "c".repeat(64) } : { data: null }));
}

const call = (eventId: string, body: unknown) =>
  POST(new Request(`https://x/api/protocol/events/${eventId}`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: eventId }) });
const get = (eventId: string) => GET(new Request(`https://x/api/protocol/events/${eventId}`), { params: Promise.resolve({ id: eventId }) });
const exportCsv = (eventId: string, report = "general") =>
  EXPORT(new Request(`https://x/api/protocol/events/${eventId}/export?report=${report}`), { params: Promise.resolve({ id: eventId }) });
const writes = () => h.db.queries.filter((q) => q.op !== "select" && q.table.startsWith("protocol_"));

beforeEach(() => { vi.clearAllMocks(); world(); });

describe("aislamiento multitenant (prueba crítica)", () => {
  it("un usuario de otro tenant no puede ver, editar ni exportar datos de Fuente de Vida (404, sin filtrar existencia)", async () => {
    h.user = { id: U.otherOwner };
    expect((await get(EV)).status).toBe(404);
    expect((await call(EV, { action: "person.update", id: P1, full_name: "Hackeado" })).status).toBe(404);
    expect((await call(EV, { action: "person.coverage", id: P1, status: "confirmed" })).status).toBe(404);
    expect((await call(EV, { action: "link.get", order_id: "11111111-1111-4111-8111-111111111111" })).status).toBe(404);
    expect((await exportCsv(EV)).status).toBe(404);
    expect(writes()).toHaveLength(0);
  });

  it("el módulo no existe para organizaciones sin el feature, ni siquiera para su dueño", async () => {
    h.user = { id: U.otherOwner };
    expect((await get(EV_OTHER)).status).toBe(404);
    expect((await call(EV_OTHER, { action: "settings.update", enabled: true })).status).toBe(404);
    expect(h.db.tables.protocol_event_settings.some((s) => s.event_id === EV_OTHER)).toBe(false);
  });

  it("el tenant SIEMPRE sale del evento en BD, nunca del body (org_id inyectado se ignora)", async () => {
    h.user = { id: U.admin };
    const res = await call(EV, { action: "guest.create", full_name: "Invitado VIP", org_id: OTHER, event_id: EV_OTHER });
    expect(res.status).toBe(200);
    const g = h.db.tables.protocol_people.find((p) => p.full_name === "Invitado VIP")!;
    expect(g).toMatchObject({ org_id: FDV, event_id: EV, kind: "guest" });
  });

  it("acceso horizontal: ids de otro evento (aunque sea del mismo tenant) se rechazan", async () => {
    h.user = { id: U.admin };
    expect((await call(EV, { action: "person.update", id: P_OTHER_EVENT, full_name: "X" })).status).toBe(404);
    expect((await call(EV, { action: "table.assign", table_id: T_EV2, person_id: P1 })).status).toBe(404);
    expect((await call(EV, { action: "table.applySuggestions", pairs: [{ table_id: T_EV2, person_id: P1 }] })).status).toBe(403);
    expect((await call(EV, { action: "meal.invite", session_id: "c0000000-0000-4000-8000-000000000009", person_ids: [P1] })).status).toBe(404);
    expect(h.db.rpcCalls.filter((c) => c.fn === "protocol_assign_table")).toHaveLength(0);
  });

  it("sin sesión → 401", async () => {
    h.user = null;
    expect((await get(EV)).status).toBe(401);
    expect((await call(EV, { action: "table.suggest" })).status).toBe(401);
  });

  it("evento del tenant con el módulo apagado: solo se permite configurarlo", async () => {
    h.user = { id: U.admin };
    expect((await call(EV2, { action: "guest.create", full_name: "Alguien" })).status).toBe(409);
    const body = await (await get(EV2)).json();
    expect(body.data).toBeNull();
  });
});

describe("permisos por rol", () => {
  it("recepción (scanner) no entra al módulo", async () => {
    h.user = { id: U.scanner };
    expect((await get(EV)).status).toBe(403);
    expect((await call(EV, { action: "person.update", id: P1, full_name: "X" })).status).toBe(403);
  });

  it("organizador (staff) gestiona asistentes pero NO valida cobertura, ni exporta, ni excede capacidad", async () => {
    h.user = { id: U.staff };
    expect((await call(EV, { action: "person.update", id: P1, relation: "Pastor anfitrión" })).status).toBe(200);
    expect((await call(EV, { action: "person.coverage", id: P1, status: "confirmed" })).status).toBe(403);
    expect((await call(EV, { action: "table.assign", table_id: T1, person_id: P1, allow_over: true })).status).toBe(403);
    expect((await call(EV, { action: "settings.update", enabled: false })).status).toBe(403);
    expect((await call(EV, { action: "guest.create", full_name: "Nuevo" })).status).toBe(403);
    expect((await exportCsv(EV)).status).toBe(403);
    expect(h.db.tables.protocol_people.find((p) => p.id === P1)!.coverage_status).toBe("pending");
  });

  it("staff no modifica a un asistente que ya hizo check-in; admin sí (autorización administrativa)", async () => {
    h.db.tables.tickets[0].status = "checked_in";
    h.user = { id: U.staff };
    expect((await call(EV, { action: "person.update", id: P1, full_name: "Cambio" })).status).toBe(403);
    h.user = { id: U.admin };
    expect((await call(EV, { action: "person.update", id: P1, full_name: "Cambio" })).status).toBe(200);
  });

  it("staff no puede alterar una cobertura ya validada (p. ej. desmarcando 'pastor')", async () => {
    h.db.tables.protocol_people[0].coverage_status = "confirmed";
    h.user = { id: U.staff };
    expect((await call(EV, { action: "person.update", id: P1, is_pastor: false })).status).toBe(403);
    expect((await call(EV, { action: "person.update", id: P1, relation: "Anfitrión" })).status).toBe(200);
    expect(h.db.tables.protocol_people[0]).toMatchObject({ is_pastor: true, coverage_status: "confirmed" });
  });

  it("admin valida cobertura y queda registrado como revisor", async () => {
    h.user = { id: U.admin };
    expect((await call(EV, { action: "person.coverage", id: P1, status: "confirmed", note: "Verificado con la red" })).status).toBe(200);
    expect(h.db.tables.protocol_people.find((p) => p.id === P1)).toMatchObject({
      coverage_status: "confirmed", coverage_reviewed_by: U.admin, updated_by_kind: "admin", is_pastor: true,
    });
  });

  it("solo invitados especiales se pueden eliminar (nunca un boleto)", async () => {
    h.user = { id: U.admin };
    expect((await call(EV, { action: "guest.delete", id: P1 })).status).toBe(400);
    expect(h.db.tables.protocol_people.some((p) => p.id === P1)).toBe(true);
  });

  it("mesa llena → 409 con código para pedir autorización", async () => {
    h.user = { id: U.admin };
    h.db = Object.assign(h.db, {}); // misma BD
    const rpc = h.db.rpc;
    h.db.rpc = ((fn: string, args?: Record<string, unknown>) =>
      fn === "protocol_assign_table" && !args?.p_allow_over ? Promise.resolve({ data: null, error: { message: "mesa llena (capacidad 8)" } }) : rpc(fn, args)) as FakeDb["rpc"];
    const res = await call(EV, { action: "table.assign", table_id: T1, person_id: P1 });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("capacity");
    expect((await call(EV, { action: "table.assign", table_id: T1, person_id: P1, allow_over: true })).status).toBe(200);
  });

  it("payload inválido o acción desconocida → 400 sin tocar la BD", async () => {
    h.user = { id: U.admin };
    expect((await call(EV, { action: "drop.table" })).status).toBe(400);
    expect((await call(EV, { action: "person.update", id: "not-a-uuid" })).status).toBe(400);
    expect(writes()).toHaveLength(0);
  });
});

describe("exportación", () => {
  it("admin exporta CSV y se neutraliza la inyección de fórmulas", async () => {
    h.user = { id: U.admin };
    h.db.tables.protocol_people[0].full_name = "=HYPERLINK(\"http://evil\")";
    const res = await exportCsv(EV);
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain("Otro evento"); // nada de otros eventos
  });
  it("reporte desconocido → 400", async () => {
    h.user = { id: U.admin };
    expect((await exportCsv(EV, "../../etc")).status).toBe(400);
  });
});
