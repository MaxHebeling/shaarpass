/**
 * Check-in por recepción: sin regresiones para otros tenants; en eventos con
 * Protocolo agrega SOLO la información mínima (acceso, brazalete, mesa).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMemoryDb, type Tables } from "@/test/memoryDb";
import type { FakeDb } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb & { tables: Tables }, enabled: false }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db }));

import { POST } from "./route";

const EV = "e0000000-0000-4000-8000-000000000001";

function world(withProtocol: boolean) {
  h.enabled = withProtocol;
  h.db = createMemoryDb({
    tickets: [{
      id: "tk1", qr_token: "qr1", status: "valid", checked_in_at: null, checked_in_gate: null, event_id: EV,
      ticket_types: { name: "General" }, attendees: { first_name: "María López", last_name: null }, orders: { buyer_name: "Pastor Juan" },
    }],
    event_days: [{ id: "d1", event_id: EV, starts_at: "2020-01-01T00:00:00Z", ends_at: "2099-01-01T00:00:00Z", day_date: "2026-11-14" }],
    ticket_checkins: [], checkin_log: [],
    protocol_people: withProtocol ? [{
      ticket_id: "tk1", event_id: EV, category: "spouse", access_category: null, badge: "Dorado",
      admin_notes: "privado", coverage_status: "confirmed", protocol_table_assignments: [{ protocol_tables: { name: "Mesa 01" } }],
    }] : [],
  }, (fn) => {
    if (fn === "staff_session") return { data: [{ event_id: EV, staff_id: "s1", gate: "A", revoked: false, expired: false, safetix_enabled: false }] };
    if (fn === "protocol_enabled_for_event") return { data: h.enabled };
    return { data: null };
  });
}

const scan = () => POST(new Request("https://x/api/checkin/staff", { method: "POST", body: JSON.stringify({ staffToken: "st", token: "qr1" }) }));

beforeEach(() => vi.clearAllMocks());

describe("check-in de recepción", () => {
  it("evento sin Protocolo: respuesta idéntica a la actual (sin campo detail)", async () => {
    world(false);
    const body = await (await scan()).json();
    expect(body).toMatchObject({ result: "ok", attendee: "María López", type: "General" });
    expect(body).not.toHaveProperty("detail");
  });

  it("evento con Protocolo: muestra acceso/brazalete/mesa y nada administrativo", async () => {
    world(true);
    const body = await (await scan()).json();
    expect(body.result).toBe("ok");
    expect(body.detail).toBe("Esposo / esposa · Brazalete: Dorado · Mesa: Mesa 01");
    expect(JSON.stringify(body)).not.toMatch(/privado|confirmed|cobertura/i);
  });

  it("si hay datos pero el módulo se apagó, no se muestra nada extra", async () => {
    world(true);
    h.enabled = false;
    expect(await (await scan()).json()).not.toHaveProperty("detail");
  });
});
