/**
 * Reglas de negocio del módulo de Protocolo (asistentes, cobertura, comidas, mesas).
 * Funciones puras: sin red ni base de datos, fáciles de probar.
 * Las invariantes duras (un boleto = una persona, capacidad, aislamiento) también
 * viven en Postgres (migración 0013); aquí se calculan vistas y validaciones de UX.
 */
import { z } from "zod";

export const FEATURE_PROTOCOL = "protocol";

// ─── Catálogos ────────────────────────────────────────────────────────────────
export const CATEGORIES = ["holder", "spouse", "child", "leader", "collaborator", "guest", "other"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  holder: "Titular",
  spouse: "Esposo / esposa",
  child: "Hijo / hija",
  leader: "Líder",
  collaborator: "Colaborador",
  guest: "Invitado",
  other: "Otro",
};

export const COVERAGE_CLAIMS = ["yes", "no", "org_confirm"] as const;
export type CoverageClaim = (typeof COVERAGE_CLAIMS)[number];
export const COVERAGE_STATUSES = ["pending", "confirmed", "not_confirmed", "not_applicable"] as const;
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];
export const COVERAGE_LABEL: Record<CoverageStatus, string> = {
  pending: "Pendiente de validación",
  confirmed: "Cobertura confirmada",
  not_confirmed: "Cobertura no confirmada",
  not_applicable: "No aplica",
};
export const CONFIRMATION = ["pending", "confirmed", "declined"] as const;
export type Confirmation = (typeof CONFIRMATION)[number];
export const CONFIRMATION_LABEL: Record<Confirmation, string> = { pending: "Pendiente", confirmed: "Confirmado", declined: "Rechazado" };
export const ACCOMPANIED = ["yes", "no", "tbd"] as const;

// ─── Tipos de datos ──────────────────────────────────────────────────────────
export interface ProtocolSettings {
  event_id: string;
  enabled: boolean;
  companions_enabled: boolean;
  coverage_enabled: boolean;
  coverage_leader: string | null;
  meals_enabled: boolean;
  tables_enabled: boolean;
  guests_enabled: boolean;
  edit_deadline: string | null;
  lock_after_checkin: boolean;
}

export interface Person {
  id: string;
  kind: "ticket" | "guest";
  ticket_id: string | null;
  order_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  category: Category | null;
  relation: string | null;
  is_pastor: boolean | null;
  coverage_claim: CoverageClaim | null;
  coverage_status: CoverageStatus;
  confirmation_status: Confirmation;
  access_category: string | null;
  badge: string | null;
  admin_notes: string | null;
  /** Estado del boleto (null para invitados sin compra). */
  ticket_status: string | null;
  checked_in: boolean;
  buyer_name: string | null;
  buyer_email: string | null;
}

export interface MealSession { id: string; name: string; starts_at: string | null; capacity: number | null }
export interface MealInvitation {
  id: string; session_id: string; person_id: string; status: Confirmation;
  invitation_type: string | null; companions_allowed: number; badge: string | null; notes: string | null;
}
export interface TableRow { id: string; name: string; capacity: number; reserved_seats: number; reserved_for: string | null; session_id: string | null; sort: number }
export interface Assignment { id: string; table_id: string; person_id: string; seat_label: string | null; over_capacity: boolean }

// ─── Estado del boleto / persona ─────────────────────────────────────────────
export const ACTIVE_TICKET = new Set(["valid", "checked_in"]);

/** Una persona cuenta como asistente activo si es invitado especial o su boleto sigue vigente. */
export function isActive(p: Pick<Person, "kind" | "ticket_status" | "confirmation_status">): boolean {
  if (p.kind === "guest") return p.confirmation_status !== "declined";
  return p.ticket_status != null && ACTIVE_TICKET.has(p.ticket_status);
}

export function isIdentified(p: Pick<Person, "full_name">): boolean {
  return !!p.full_name && p.full_name.trim().length >= 2;
}

/** ¿Puede el COMPRADOR modificar este asistente? (el admin no pasa por aquí). */
export function buyerEditBlock(
  p: Pick<Person, "ticket_status" | "checked_in">,
  s: Pick<ProtocolSettings, "enabled" | "edit_deadline" | "lock_after_checkin">,
  now: Date = new Date(),
): null | "disabled" | "deadline" | "checked_in" | "inactive" {
  if (!s.enabled) return "disabled";
  if (s.edit_deadline && now.getTime() > new Date(s.edit_deadline).getTime()) return "deadline";
  if (p.ticket_status == null || !ACTIVE_TICKET.has(p.ticket_status)) return "inactive";
  if (s.lock_after_checkin && (p.checked_in || p.ticket_status === "checked_in")) return "checked_in";
  return null;
}

export const BLOCK_MESSAGE: Record<NonNullable<ReturnType<typeof buyerEditBlock>>, string> = {
  disabled: "El registro de asistentes no está disponible para este evento.",
  deadline: "La fecha límite para modificar asistentes ya pasó. Contacta a la organización.",
  checked_in: "Este asistente ya ingresó al evento; solo la organización puede modificarlo.",
  inactive: "Este boleto fue cancelado, reembolsado o anulado.",
};

// ─── Duplicados ──────────────────────────────────────────────────────────────
export function normalizeName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(pastor|pastora|pr|pra|apostol|apóstol|ap|dr|dra|lic|ing)\.?\s+/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Grupos de personas activas que probablemente son la misma (nombre o correo). */
export function findDuplicates(people: Person[]): string[][] {
  const groups = new Map<string, Set<string>>();
  const add = (k: string, id: string) => {
    if (!k) return;
    const g = groups.get(k) ?? new Set<string>();
    g.add(id); groups.set(k, g);
  };
  for (const p of people) {
    if (!isActive(p)) continue;
    const n = normalizeName(p.full_name);
    if (n.length >= 5) add(`n:${n}`, p.id);
    const e = (p.kind === "guest" ? p.email : null)?.trim().toLowerCase();
    if (e) add(`e:${e}`, p.id);
  }
  // Invitado especial cuyo correo coincide con un comprador del evento.
  const buyerEmails = new Map<string, string>();
  for (const p of people) if (p.kind === "ticket" && p.buyer_email && isActive(p)) buyerEmails.set(p.buyer_email.toLowerCase(), p.id);
  for (const p of people) {
    if (p.kind !== "guest" || !isActive(p) || !p.email) continue;
    const match = buyerEmails.get(p.email.toLowerCase());
    if (match) { add(`b:${p.email.toLowerCase()}`, p.id); add(`b:${p.email.toLowerCase()}`, match); }
  }
  // Une grupos que comparten miembros y descarta singletons.
  const merged: Set<string>[] = [];
  for (const g of groups.values()) {
    if (g.size < 2) continue;
    const hit = merged.find((m) => [...g].some((id) => m.has(id)));
    if (hit) g.forEach((id) => hit.add(id)); else merged.push(new Set(g));
  }
  return merged.map((m) => [...m].sort());
}

// ─── Mesas ───────────────────────────────────────────────────────────────────
export interface TableOccupancy {
  table: TableRow;
  people: Person[];
  assigned: number;
  reserved: number;
  pending: number;   // asignados sin nombre o sin confirmar
  free: number;
  over: boolean;
}

export function tableOccupancy(tables: TableRow[], assignments: Assignment[], people: Person[]): TableOccupancy[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  return [...tables].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "es", { numeric: true })).map((t) => {
    const ps = assignments.filter((a) => a.table_id === t.id).map((a) => byId.get(a.person_id)).filter((p): p is Person => !!p);
    const pending = ps.filter((p) => !isIdentified(p) || p.confirmation_status === "pending").length;
    const used = ps.length + t.reserved_seats;
    return { table: t, people: ps, assigned: ps.length, reserved: t.reserved_seats, pending, free: Math.max(0, t.capacity - used), over: used > t.capacity };
  });
}

/** Sugerencia de mesas: agrupa por compra (familias/matrimonios), pastores con cobertura primero. Nunca escribe. */
export function suggestSeating(people: Person[], tables: TableOccupancy[]): { personId: string; tableId: string }[] {
  const seated = new Set(tables.flatMap((t) => t.people.map((p) => p.id)));
  const free = new Map(tables.map((t) => [t.table.id, t.free]));
  const groups = new Map<string, Person[]>();
  for (const p of people) {
    if (!isActive(p) || seated.has(p.id)) continue;
    const k = p.order_id ?? `g:${p.id}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const rank = (g: Person[]) => (g.some((p) => p.coverage_status === "confirmed") ? 0 : g.some((p) => p.is_pastor) ? 1 : 2);
  const ordered = [...groups.values()].sort((a, b) => rank(a) - rank(b) || b.length - a.length);
  const out: { personId: string; tableId: string }[] = [];
  for (const g of ordered) {
    const target = tables.find((t) => (free.get(t.table.id) ?? 0) >= g.length);
    if (!target) continue; // no parte grupos: el admin decide
    for (const p of g) out.push({ personId: p.id, tableId: target.table.id });
    free.set(target.table.id, (free.get(target.table.id) ?? 0) - g.length);
  }
  return out;
}

// ─── Indicadores y alertas ───────────────────────────────────────────────────
export interface Metrics {
  ticketsSold: number;
  orders: number;
  identified: number;
  pendingIdentification: number;
  pastors: number;
  coverageConfirmed: number;
  coveragePending: number;
  specialGuests: number;
  mealConfirmed: number;
  mealPending: number;
  tablesWithSpace: number;
  seatsAssigned: number;
  checkedIn: number;
}

export function computeMetrics(people: Person[], invitations: MealInvitation[], occupancy: TableOccupancy[]): Metrics {
  const active = people.filter(isActive);
  const tickets = active.filter((p) => p.kind === "ticket");
  const activeIds = new Set(active.map((p) => p.id));
  const inv = invitations.filter((i) => activeIds.has(i.person_id));
  // Una persona confirmada en varias comidas cuenta una vez.
  const mealConfirmed = new Set(inv.filter((i) => i.status === "confirmed").map((i) => i.person_id));
  const mealPending = new Set(inv.filter((i) => i.status === "pending" && !mealConfirmed.has(i.person_id)).map((i) => i.person_id));
  return {
    ticketsSold: tickets.length,
    orders: new Set(tickets.map((p) => p.order_id).filter(Boolean)).size,
    identified: active.filter(isIdentified).length,
    pendingIdentification: active.filter((p) => !isIdentified(p)).length,
    pastors: active.filter((p) => p.is_pastor).length,
    coverageConfirmed: active.filter((p) => p.coverage_status === "confirmed").length,
    coveragePending: active.filter((p) => p.coverage_status === "pending").length,
    specialGuests: active.filter((p) => p.kind === "guest").length,
    mealConfirmed: mealConfirmed.size,
    mealPending: mealPending.size,
    tablesWithSpace: occupancy.filter((o) => o.free > 0).length,
    seatsAssigned: occupancy.reduce((n, o) => n + o.people.filter((p) => activeIds.has(p.id)).length, 0),
    checkedIn: active.filter((p) => p.checked_in).length,
  };
}

export interface Alert { level: "warn" | "info"; code: string; message: string; count: number }

export function computeAlerts(people: Person[], invitations: MealInvitation[], occupancy: TableOccupancy[]): Alert[] {
  const active = people.filter(isActive);
  const out: Alert[] = [];
  const push = (level: Alert["level"], code: string, count: number, message: string) => { if (count > 0) out.push({ level, code, count, message }); };

  const unnamed = active.filter((p) => p.kind === "ticket" && !isIdentified(p));
  push("warn", "unnamed", unnamed.length, `${unnamed.length} boleto(s) sin nombre de asistente`);
  const ordersWithPending = new Set(unnamed.map((p) => p.order_id));
  push("info", "companions", ordersWithPending.size, `${ordersWithPending.size} compra(s) con acompañantes pendientes`);
  push("warn", "coverage", active.filter((p) => p.coverage_status === "pending").length, `${active.filter((p) => p.coverage_status === "pending").length} cobertura(s) pastoral(es) por validar`);

  const seated = new Set(occupancy.flatMap((o) => o.people.map((p) => p.id)));
  const activeIds = new Set(active.map((p) => p.id));
  const confirmedNoTable = new Set(invitations.filter((i) => i.status === "confirmed" && activeIds.has(i.person_id) && !seated.has(i.person_id)).map((i) => i.person_id));
  if (occupancy.length) push("warn", "no_table", confirmedNoTable.size, `${confirmedNoTable.size} invitado(s) confirmado(s) sin mesa`);
  const over = occupancy.filter((o) => o.over);
  push("warn", "over_capacity", over.length, `${over.length} mesa(s) por encima de su capacidad: ${over.map((o) => o.table.name).join(", ")}`);
  const dups = findDuplicates(people);
  push("info", "duplicates", dups.length, `${dups.length} posible(s) registro(s) duplicado(s)`);

  const inactiveWithData = people.filter((p) => p.kind === "ticket" && !isActive(p) && (seated.has(p.id) || invitations.some((i) => i.person_id === p.id && i.status !== "declined")));
  push("warn", "inactive_assigned", inactiveWithData.length, `${inactiveWithData.length} persona(s) con boleto cancelado/reembolsado aún con mesa o comida`);
  return out;
}

// ─── Validación de entrada ───────────────────────────────────────────────────
const optText = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

/** Datos que el COMPRADOR puede enviar por cada boleto. */
export const buyerPersonSchema = z.object({
  id: z.string().uuid(),
  full_name: optText(160),
  email: z.string().trim().max(200).email().optional().nullable().or(z.literal("")).transform((v) => (v ? v.toLowerCase() : null)),
  phone: optText(40),
  city: optText(120),
  category: z.enum(CATEGORIES).optional().nullable().transform((v) => v ?? null),
  relation: optText(120),
  is_pastor: z.boolean().optional().nullable().transform((v) => v ?? null),
  coverage_claim: z.enum(COVERAGE_CLAIMS).optional().nullable().transform((v) => v ?? null),
});
export type BuyerPersonInput = z.infer<typeof buyerPersonSchema>;

export const buyerPayloadSchema = z.object({
  accompanied: z.enum(ACCOMPANIED).optional().nullable(),
  people: z.array(buyerPersonSchema).max(50),
});

/** Quita campos que el evento no habilita (p. ej. cobertura apagada). */
export function sanitizeBuyerPerson(p: BuyerPersonInput, s: Pick<ProtocolSettings, "coverage_enabled">): BuyerPersonInput {
  if (s.coverage_enabled) {
    return { ...p, coverage_claim: p.is_pastor ? p.coverage_claim : null };
  }
  return { ...p, is_pastor: null, coverage_claim: null };
}
