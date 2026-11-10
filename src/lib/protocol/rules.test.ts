import { describe, it, expect } from "vitest";
import {
  buyerEditBlock, buyerPayloadSchema, computeAlerts, computeMetrics, findDuplicates, isActive, normalizeName,
  sanitizeBuyerPerson, suggestSeating, tableOccupancy,
  type Assignment, type MealInvitation, type Person, type TableRow,
} from "./rules";

let n = 0;
function person(p: Partial<Person> = {}): Person {
  n++;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, kind: "ticket", ticket_id: `t${n}`, order_id: "o1",
    full_name: null, email: null, phone: null, city: null, category: null, relation: null, is_pastor: null,
    coverage_claim: null, coverage_status: "not_applicable", confirmation_status: "pending", access_category: null,
    badge: null, admin_notes: null, ticket_status: "valid", checked_in: false, buyer_name: "Pastor Juan Pérez", buyer_email: "juan@x.mx",
    ...p,
  };
}
const settings = { enabled: true, edit_deadline: null, lock_after_checkin: true };

describe("edición por el comprador", () => {
  it("permitida en boleto válido", () => expect(buyerEditBlock(person(), settings)).toBeNull());
  it("bloqueada tras check-in (salvo que el evento lo permita)", () => {
    expect(buyerEditBlock(person({ ticket_status: "checked_in", checked_in: true }), settings)).toBe("checked_in");
    expect(buyerEditBlock(person({ ticket_status: "checked_in", checked_in: true }), { ...settings, lock_after_checkin: false })).toBeNull();
  });
  it("bloqueada en boletos cancelados/reembolsados", () => {
    expect(buyerEditBlock(person({ ticket_status: "refunded" }), settings)).toBe("inactive");
    expect(buyerEditBlock(person({ ticket_status: "void" }), settings)).toBe("inactive");
  });
  it("bloqueada pasada la fecha límite del evento", () => {
    const s = { ...settings, edit_deadline: "2026-11-01T00:00:00Z" };
    expect(buyerEditBlock(person(), s, new Date("2026-11-02T00:00:00Z"))).toBe("deadline");
    expect(buyerEditBlock(person(), s, new Date("2026-10-31T00:00:00Z"))).toBeNull();
  });
  it("bloqueada si el módulo se apagó", () => expect(buyerEditBlock(person(), { ...settings, enabled: false })).toBe("disabled"));
});

describe("validación de entrada del comprador", () => {
  it("rechaza ids no-uuid y más de 50 personas", () => {
    expect(buyerPayloadSchema.safeParse({ people: [{ id: "1 or 1=1" }] }).success).toBe(false);
    expect(buyerPayloadSchema.safeParse({ people: Array.from({ length: 51 }, () => ({ id: person().id })) }).success).toBe(false);
  });
  it("no acepta campos administrativos (coverage_status se descarta)", () => {
    const r = buyerPayloadSchema.parse({ people: [{ id: person().id, full_name: " Ana ", coverage_status: "confirmed" }] });
    expect(r.people[0]).not.toHaveProperty("coverage_status");
    expect(r.people[0].full_name).toBe("Ana");
  });
  it("sanitiza cobertura cuando el evento no la usa o no es pastor", () => {
    const base = buyerPayloadSchema.parse({ people: [{ id: person().id, is_pastor: false, coverage_claim: "yes" }] }).people[0];
    expect(sanitizeBuyerPerson(base, { coverage_enabled: true }).coverage_claim).toBeNull();
    const pastor = { ...base, is_pastor: true };
    expect(sanitizeBuyerPerson(pastor, { coverage_enabled: false })).toMatchObject({ is_pastor: null, coverage_claim: null });
  });
});

describe("duplicados", () => {
  it("normaliza títulos y acentos", () => expect(normalizeName("Pastor  Ricardo Sánchez")).toBe("ricardo sanchez"));
  it("detecta invitado especial que ya compró (mismo correo) y nombres repetidos", () => {
    const a = person({ full_name: "Pastor Ricardo Sánchez", buyer_email: "ricardo@x.mx", order_id: "o9" });
    const b = person({ kind: "guest", ticket_id: null, order_id: null, ticket_status: null, full_name: "Ricardo Sanchez", email: "ricardo@x.mx", confirmation_status: "confirmed" });
    const c = person({ full_name: "Otra Persona" });
    const groups = findDuplicates([a, b, c]);
    expect(groups).toHaveLength(1);
    expect(groups[0].sort()).toEqual([a.id, b.id].sort());
  });
  it("ignora boletos reembolsados", () => {
    expect(findDuplicates([person({ full_name: "María López" }), person({ full_name: "María López", ticket_status: "refunded" })])).toEqual([]);
  });
});

describe("indicadores", () => {
  it("no mezcla compras con asistentes y no cuenta dos veces una comida", () => {
    const people = [
      person({ order_id: "o1", full_name: "Pastor Juan Pérez", is_pastor: true, coverage_claim: "yes", coverage_status: "confirmed" }),
      person({ order_id: "o1", full_name: "María López", category: "spouse" }),
      person({ order_id: "o1" }), // pendiente
      person({ order_id: "o2", is_pastor: true, coverage_claim: "org_confirm", coverage_status: "pending", full_name: "Pastor Ricardo" }),
      person({ order_id: "o3", ticket_status: "refunded", full_name: "Reembolsado" }),
      person({ kind: "guest", ticket_id: null, order_id: null, ticket_status: null, full_name: "Invitado VIP", confirmation_status: "confirmed" }),
    ];
    const inv: MealInvitation[] = [
      { id: "i1", session_id: "s1", person_id: people[0].id, status: "confirmed", invitation_type: null, companions_allowed: 0, badge: null, notes: null },
      { id: "i2", session_id: "s2", person_id: people[0].id, status: "confirmed", invitation_type: null, companions_allowed: 0, badge: null, notes: null },
      { id: "i3", session_id: "s1", person_id: people[5].id, status: "pending", invitation_type: null, companions_allowed: 0, badge: null, notes: null },
      { id: "i4", session_id: "s1", person_id: people[4].id, status: "confirmed", invitation_type: null, companions_allowed: 0, badge: null, notes: null },
    ];
    const m = computeMetrics(people, inv, []);
    expect(m.ticketsSold).toBe(4);   // excluye el reembolsado y al invitado sin compra
    expect(m.orders).toBe(2);
    expect(m.identified).toBe(4);
    expect(m.pendingIdentification).toBe(1);
    expect(m.pastors).toBe(2);
    expect(m.coverageConfirmed).toBe(1);
    expect(m.coveragePending).toBe(1);
    expect(m.specialGuests).toBe(1);
    expect(m.mealConfirmed).toBe(1);  // 2 comidas, 1 persona; el reembolsado no cuenta
    expect(m.mealPending).toBe(1);
  });
});

describe("mesas", () => {
  const T = (id: string, capacity: number, reserved = 0): TableRow => ({ id, name: id, capacity, reserved_seats: reserved, reserved_for: null, session_id: null, sort: 0 });
  it("calcula ocupados, reservados, libres, pendientes y exceso", () => {
    const ps = [person({ full_name: "Ana", confirmation_status: "confirmed" }), person(), person({ full_name: "Carlos", confirmation_status: "confirmed" })];
    const asg: Assignment[] = ps.map((p, i) => ({ id: `a${i}`, table_id: "M1", person_id: p.id, seat_label: null, over_capacity: false }));
    const [o] = tableOccupancy([T("M1", 4, 2)], asg, ps);
    expect(o).toMatchObject({ assigned: 3, reserved: 2, free: 0, pending: 1, over: true });
  });
  it("la sugerencia agrupa familias, prioriza cobertura y nunca excede capacidad", () => {
    const fam = [person({ order_id: "fam", full_name: "P", coverage_status: "confirmed", is_pastor: true, coverage_claim: "yes" }), person({ order_id: "fam", full_name: "E" })];
    const big = [1, 2, 3].map(() => person({ order_id: "big", full_name: "X" }));
    const occ = tableOccupancy([T("M1", 2), T("M2", 2)], [], [...fam, ...big]);
    const s = suggestSeating([...fam, ...big], occ);
    expect(s.filter((x) => x.tableId === "M1").map((x) => x.personId).sort()).toEqual(fam.map((p) => p.id).sort());
    expect(s.filter((x) => big.some((b) => b.id === x.personId))).toHaveLength(0); // grupo de 3 no cabe → no se parte
  });
});

describe("alertas", () => {
  it("avisa de boletos sin nombre, coberturas, confirmados sin mesa y reembolsados con lugar", () => {
    const a = person({ full_name: null });
    const b = person({ full_name: "B", is_pastor: true, coverage_claim: "yes", coverage_status: "pending" });
    const c = person({ full_name: "C", ticket_status: "refunded" });
    const inv: MealInvitation[] = [{ id: "i", session_id: "s", person_id: b.id, status: "confirmed", invitation_type: null, companions_allowed: 0, badge: null, notes: null }];
    const occ = tableOccupancy([{ id: "M", name: "Mesa 1", capacity: 4, reserved_seats: 0, reserved_for: null, session_id: null, sort: 0 }],
      [{ id: "x", table_id: "M", person_id: c.id, seat_label: null, over_capacity: false }], [a, b, c]);
    const codes = computeAlerts([a, b, c], inv, occ).map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(["unnamed", "companions", "coverage", "no_table", "inactive_assigned"]));
    expect(isActive(c)).toBe(false);
  });
});
