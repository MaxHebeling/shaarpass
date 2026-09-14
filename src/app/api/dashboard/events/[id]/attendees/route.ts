import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseCustomFields } from "@/lib/ticketing/customFields";

export const runtime = "nodejs";

/** Escapa un campo para CSV (comillas dobladas, todo entrecomillado). */
function csv(value: unknown): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

interface TicketRow {
  status: string;
  checked_in_at: string | null;
  ticket_types: { name: string } | null;
  attendees: { first_name: string | null; last_name: string | null; email: string | null } | null;
  orders: {
    buyer_name: string | null; buyer_email: string | null; buyer_phone: string | null;
    buyer_city: string | null; buyer_country: string | null; paid_at: string | null; payment_method: string | null;
    custom_data: Record<string, string> | null;
  } | null;
}

/** Exporta la lista de asistentes de un evento en CSV. Solo el dueño/miembro de la
 *  organización del evento puede descargarla. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Autenticación + autorización: el usuario debe ser miembro de la org del evento.
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const admin = createAdminClient();
  const { data: event } = await admin.from("events").select("id, slug, org_id, custom_fields").eq("id", id).maybeSingle();
  if (!event) return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  const customFields = parseCustomFields(event.custom_fields);
  const { data: member } = await admin
    .from("org_members").select("user_id").eq("org_id", event.org_id).eq("user_id", user.id).maybeSingle();
  if (!member) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  // Una fila por boleto emitido (asistente). Datos del asistente si existen, si no del comprador.
  const { data: ticketData } = await admin
    .from("tickets")
    .select("status, checked_in_at, ticket_types(name), attendees(first_name, last_name, email), orders(buyer_name, buyer_email, buyer_phone, buyer_city, buyer_country, paid_at, payment_method, custom_data)")
    .eq("event_id", id)
    .in("status", ["valid", "checked_in"]);
  const tickets = (ticketData ?? []) as unknown as TicketRow[];

  const header = ["Nombre", "Correo", "Teléfono", "Ciudad", "País", "Tipo de boleto", "Estado", "Check-in", "Fecha de compra", "Método de pago", ...customFields.map((f) => f.label)];
  const rows = tickets.map((t) => {
    const a = t.attendees;
    const o = t.orders;
    const nombre = [a?.first_name, a?.last_name].filter(Boolean).join(" ") || o?.buyer_name || "";
    const correo = a?.email || o?.buyer_email || "";
    const estado = t.status === "checked_in" ? "Registrado" : "Válido";
    const checkin = t.checked_in_at ? new Date(t.checked_in_at).toLocaleString("es-MX") : "";
    const compra = o?.paid_at ? new Date(o.paid_at).toLocaleString("es-MX") : "";
    const cd = o?.custom_data ?? {};
    return [nombre, correo, o?.buyer_phone ?? "", o?.buyer_city ?? "", o?.buyer_country ?? "", t.ticket_types?.name ?? "", estado, checkin, compra, o?.payment_method ?? "", ...customFields.map((f) => cd[f.key] ?? "")];
  });

  // BOM para que Excel abra los acentos correctamente.
  const body = "﻿" + [header, ...rows].map((r) => r.map(csv).join(",")).join("\r\n");
  const filename = `asistentes-${event.slug ?? id}.csv`;
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
