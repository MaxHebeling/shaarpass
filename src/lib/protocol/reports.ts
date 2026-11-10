/**
 * Reportes del módulo de Protocolo. Construye filas a partir de datos YA autorizados
 * y filtrados por evento; la salida es tabular (CSV para Excel o vista imprimible/PDF).
 */
import {
  CATEGORY_LABEL, CONFIRMATION_LABEL, COVERAGE_LABEL, isActive, isIdentified, tableOccupancy,
  type Person,
} from "./rules";
import type { ProtocolData } from "./data";

export const REPORTS = {
  general: "Listado general de asistentes",
  coverage_confirmed: "Pastores bajo cobertura confirmada",
  coverage_pending: "Coberturas pendientes de validación",
  pending_companions: "Compradores con acompañantes sin identificar",
  guests: "Invitados especiales",
  meals: "Personas confirmadas para comida",
  tables: "Mesas y lugares asignados",
  checkin: "Asistencia real y check-in",
  audit: "Incidencias y modificaciones administrativas",
} as const;
export type ReportKey = keyof typeof REPORTS;
export function isReportKey(k: string | null): k is ReportKey { return !!k && k in REPORTS; }

export interface AuditRow { at: string; entity: string; action: string; actor_kind: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null }
export interface Table { title: string; header: string[]; rows: string[][] }

const yesNo = (v: boolean | null) => (v === true ? "Sí" : v === false ? "No" : "");
const name = (p: Person) => p.full_name ?? "(pendiente de identificar)";
const ticketState = (p: Person) =>
  p.kind === "guest" ? "Invitado especial" : p.ticket_status === "checked_in" ? "Ingresó" : p.ticket_status === "valid" ? "Válido" : p.ticket_status ?? "";

export function buildReport(key: ReportKey, d: ProtocolData, audit: AuditRow[] = []): Table {
  const active = d.people.filter(isActive);
  const occ = tableOccupancy(d.tables, d.assignments, d.people);
  const tableOf = new Map<string, string>();
  for (const o of occ) for (const p of o.people) tableOf.set(p.id, o.table.name);
  const mealOf = new Map<string, string>();
  const sessionName = new Map(d.sessions.map((s) => [s.id, s.name]));
  for (const i of d.invitations) {
    const prev = mealOf.get(i.person_id);
    const label = `${sessionName.get(i.session_id) ?? "Comida"}: ${CONFIRMATION_LABEL[i.status]}`;
    mealOf.set(i.person_id, prev ? `${prev}; ${label}` : label);
  }
  const companions = new Map<string, number>();
  for (const p of active) if (p.order_id) companions.set(p.order_id, (companions.get(p.order_id) ?? 0) + 1);

  const base = (p: Person) => [
    name(p), p.buyer_name ?? (p.kind === "guest" ? "—" : ""), p.city ?? "", p.category ? CATEGORY_LABEL[p.category] : "",
    p.relation ?? "", yesNo(p.is_pastor), COVERAGE_LABEL[p.coverage_status], ticketState(p),
    mealOf.get(p.id) ?? "", tableOf.get(p.id) ?? "", p.checked_in ? "Sí" : "No",
  ];
  const baseHeader = ["Nombre", "Comprador", "Ciudad", "Tipo", "Relación", "Pastor", "Cobertura", "Boleto", "Comida", "Mesa", "Check-in"];
  const byName = (a: Person, b: Person) => name(a).localeCompare(name(b), "es");

  switch (key) {
    case "general":
      return { title: REPORTS.general, header: [...baseHeader, "Acompañantes en la compra"], rows: [...active].sort(byName).map((p) => [...base(p), String(p.order_id ? (companions.get(p.order_id) ?? 1) - 1 : 0)]) };
    case "coverage_confirmed":
      return { title: REPORTS.coverage_confirmed, header: baseHeader, rows: active.filter((p) => p.coverage_status === "confirmed").sort(byName).map(base) };
    case "coverage_pending":
      return { title: REPORTS.coverage_pending, header: [...baseHeader, "Respuesta"], rows: active.filter((p) => p.coverage_status === "pending").sort(byName).map((p) => [...base(p), p.coverage_claim === "yes" ? "Dice que sí" : "Que lo confirme la organización"]) };
    case "pending_companions": {
      const byOrder = new Map<string, Person[]>();
      for (const p of active) if (p.kind === "ticket" && p.order_id) byOrder.set(p.order_id, [...(byOrder.get(p.order_id) ?? []), p]);
      const rows = [...byOrder.values()].filter((ps) => ps.some((p) => !isIdentified(p))).map((ps) => [
        ps[0].buyer_name ?? "", ps[0].buyer_email ?? "", String(ps.length), String(ps.filter((p) => !isIdentified(p)).length),
        ps.filter(isIdentified).map((p) => p.full_name).join(", "),
      ]);
      return { title: REPORTS.pending_companions, header: ["Comprador", "Correo", "Boletos", "Sin identificar", "Identificados"], rows };
    }
    case "guests":
      return { title: REPORTS.guests, header: [...baseHeader, "Acreditación", "Correo", "Teléfono"], rows: active.filter((p) => p.kind === "guest").sort(byName).map((p) => [...base(p), p.badge ?? p.access_category ?? "", p.email ?? "", p.phone ?? ""]) };
    case "meals": {
      const ids = new Set(active.map((p) => p.id));
      const byId = new Map(d.people.map((p) => [p.id, p]));
      const rows = d.invitations.filter((i) => i.status === "confirmed" && ids.has(i.person_id)).map((i) => {
        const p = byId.get(i.person_id)!;
        return [sessionName.get(i.session_id) ?? "", name(p), p.category ? CATEGORY_LABEL[p.category] : "", COVERAGE_LABEL[p.coverage_status], i.invitation_type ?? "", String(i.companions_allowed), tableOf.get(p.id) ?? "Sin mesa", i.badge ?? p.badge ?? ""];
      }).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1], "es"));
      return { title: REPORTS.meals, header: ["Comida", "Nombre", "Tipo", "Cobertura", "Invitación", "Acompañantes autorizados", "Mesa", "Brazalete"], rows };
    }
    case "tables": {
      const rows: string[][] = [];
      for (const o of occ) {
        for (const p of o.people) rows.push([o.table.name, String(o.table.capacity), name(p), p.category ? CATEGORY_LABEL[p.category] : "", COVERAGE_LABEL[p.coverage_status], isActive(p) ? "" : "Boleto inactivo"]);
        for (let i = 0; i < o.reserved; i++) rows.push([o.table.name, String(o.table.capacity), `Reservado${o.table.reserved_for ? ` · ${o.table.reserved_for}` : ""}`, "", "", ""]);
        for (let i = 0; i < o.free; i++) rows.push([o.table.name, String(o.table.capacity), "Disponible", "", "", ""]);
      }
      return { title: REPORTS.tables, header: ["Mesa", "Capacidad", "Lugar", "Tipo", "Cobertura", "Nota"], rows };
    }
    case "checkin":
      return { title: REPORTS.checkin, header: ["Nombre", "Comprador", "Tipo", "Cobertura", "Estado", "Check-in"], rows: active.filter((p) => p.kind === "ticket").sort(byName).map((p) => [name(p), p.buyer_name ?? "", p.category ? CATEGORY_LABEL[p.category] : "", COVERAGE_LABEL[p.coverage_status], ticketState(p), p.checked_in ? "Sí" : "No"]) };
    case "audit": {
      const ENT: Record<string, string> = { protocol_people: "Asistente", protocol_meal_invitations: "Comida", protocol_table_assignments: "Mesa", protocol_event_settings: "Configuración" };
      const ACT: Record<string, string> = { insert: "Alta", update: "Cambio", delete: "Baja" };
      const WHO: Record<string, string> = { admin: "Organización", buyer: "Comprador", system: "Sistema", staff: "Recepción" };
      const rows = audit.map((r) => {
        const b = r.before ?? {}; const a = r.after ?? {};
        const changed = Object.keys({ ...b, ...a }).filter((k) => !["updated_at", "updated_by", "updated_by_kind", "created_at"].includes(k) && JSON.stringify(b[k]) !== JSON.stringify(a[k]));
        const who = String(a.full_name ?? b.full_name ?? "");
        return [new Date(r.at).toLocaleString("es-MX"), ENT[r.entity] ?? r.entity, ACT[r.action] ?? r.action, WHO[r.actor_kind ?? ""] ?? "", who,
          changed.slice(0, 6).map((k) => `${k}: ${fmt(b[k])} → ${fmt(a[k])}`).join(" | ")];
      });
      return { title: REPORTS.audit, header: ["Fecha", "Entidad", "Acción", "Por", "Persona", "Cambios"], rows };
    }
  }
}

function fmt(v: unknown): string {
  if (v == null || v === "") return "∅";
  return String(v).slice(0, 60);
}

/** CSV con BOM (Excel abre acentos correctamente) y neutraliza inyección de fórmulas. */
export function toCsv(t: Table): string {
  const cell = (v: string) => {
    const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return "﻿" + [t.header, ...t.rows].map((r) => r.map(cell).join(",")).join("\r\n");
}
