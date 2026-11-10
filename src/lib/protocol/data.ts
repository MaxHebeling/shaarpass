/**
 * Carga de datos del módulo de Protocolo para un evento (solo servidor, service role
 * DESPUÉS de resolver el tenant con access.ts). Todas las consultas filtran por el
 * event_id ya autorizado.
 */
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Assignment, MealInvitation, MealSession, Person, TableRow } from "./rules";

type Db = ReturnType<typeof createAdminClient>;

interface PersonRow extends Omit<Person, "ticket_status" | "checked_in" | "buyer_name" | "buyer_email"> {
  tickets: { status: string; checked_in_at: string | null; qr_token?: string } | null;
  orders: { buyer_name: string | null; buyer_email: string | null } | null;
}

export const PERSON_COLUMNS =
  "id, kind, ticket_id, order_id, full_name, email, phone, city, category, relation, is_pastor, coverage_claim, coverage_status, confirmation_status, access_category, badge, admin_notes, tickets(status, checked_in_at), orders(buyer_name, buyer_email)";

export function toPerson(r: PersonRow): Person {
  const t = Array.isArray(r.tickets) ? r.tickets[0] : r.tickets;
  const o = Array.isArray(r.orders) ? r.orders[0] : r.orders;
  return {
    id: r.id, kind: r.kind, ticket_id: r.ticket_id, order_id: r.order_id, full_name: r.full_name, email: r.email,
    phone: r.phone, city: r.city, category: r.category, relation: r.relation, is_pastor: r.is_pastor,
    coverage_claim: r.coverage_claim, coverage_status: r.coverage_status, confirmation_status: r.confirmation_status,
    access_category: r.access_category, badge: r.badge, admin_notes: r.admin_notes,
    ticket_status: t?.status ?? null,
    checked_in: t?.status === "checked_in" || !!t?.checked_in_at,
    buyer_name: o?.buyer_name ?? null, buyer_email: o?.buyer_email ?? null,
  };
}

export interface ProtocolData {
  people: Person[];
  sessions: MealSession[];
  invitations: MealInvitation[];
  tables: TableRow[];
  assignments: Assignment[];
  orders: { order_id: string; accompanied: string | null }[];
}

export async function loadProtocolData(db: Db, eventId: string): Promise<ProtocolData> {
  // Materializa boletos nuevos (idempotente) antes de leer.
  await db.rpc("protocol_sync_event", { p_event: eventId });
  const [people, sessions, invitations, tables, assignments, orders] = await Promise.all([
    db.from("protocol_people").select(PERSON_COLUMNS).eq("event_id", eventId).order("created_at").limit(5000),
    db.from("protocol_meal_sessions").select("id, name, starts_at, capacity").eq("event_id", eventId).order("starts_at", { nullsFirst: false }),
    db.from("protocol_meal_invitations").select("id, session_id, person_id, status, invitation_type, companions_allowed, badge, notes").eq("event_id", eventId),
    db.from("protocol_tables").select("id, name, capacity, reserved_seats, reserved_for, session_id, sort").eq("event_id", eventId),
    db.from("protocol_table_assignments").select("id, table_id, person_id, seat_label, over_capacity").eq("event_id", eventId),
    db.from("protocol_orders").select("order_id, accompanied").eq("event_id", eventId),
  ]);
  return {
    people: ((people.data ?? []) as unknown as PersonRow[]).map(toPerson),
    sessions: (sessions.data ?? []) as MealSession[],
    invitations: (invitations.data ?? []) as MealInvitation[],
    tables: (tables.data ?? []) as TableRow[],
    assignments: (assignments.data ?? []) as Assignment[],
    orders: (orders.data ?? []) as { order_id: string; accompanied: string | null }[],
  };
}

/** Enlace seguro para que el comprador registre a sus asistentes; null si el evento no usa el módulo. Nunca lanza. */
export async function attendeesLinkForOrder(db: Db, orderId: string): Promise<string | null> {
  try {
    const { data, error } = await db.rpc("protocol_sync_order", { p_order: orderId });
    if (error || typeof data !== "string" || !data) return null;
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.shaarpass.io";
    return `${base}/asistentes/${data}`;
  } catch {
    return null;
  }
}
