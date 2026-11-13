import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseCustomFields } from "@/lib/ticketing/customFields";
import { buildXlsx, XLSX_MIME } from "@/lib/xlsx/writer";
import {
  applyFilters, buildRows, parseFilters,
  type ItemInput, type OrderInput, type TicketInput,
} from "@/lib/reports/buyersReport";
import { buildBuyersWorkbook, type ReportView } from "@/lib/reports/buyersWorkbook";

export const runtime = "nodejs";

/** Roles que pueden ver importes (los mismos que pueden reembolsar). */
const FINANCIAL_ROLES = new Set(["owner", "admin"]);
const PAGE = 1000; // tope de filas por respuesta de PostgREST

/** Lee todas las páginas de una consulta (PostgREST corta en 1000 filas). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "Error de base de datos");
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

function slugPart(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "evento";
}

/**
 * Exporta a Excel las compras de un evento: cantidad de boletos y total pagado por
 * comprador, resumen, conciliación y lista de acceso para imprimir.
 *
 * Query: ?status=all|paid|pending|refunded|cancelled  &q=texto  &view=full|print
 * Acceso: miembros de la organización del evento. Los importes solo para owner/admin;
 * staff y scanner reciben el mismo archivo sin columnas de dinero.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const filters = parseFilters(url.searchParams);
  const view: ReportView = url.searchParams.get("view") === "print" ? "print" : "full";

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events").select("id, slug, title, org_id, currency, timezone, custom_fields").eq("id", id).maybeSingle();
  if (!event) return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });

  const { data: member } = await admin
    .from("org_members").select("user_id, role").eq("org_id", event.org_id).eq("user_id", user.id).maybeSingle();
  if (!member) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const financial = FINANCIAL_ROLES.has(String((member as { role?: string }).role ?? ""));

  try {
    // Aislamiento: todo se filtra por este evento Y por la organización del evento.
    const [orders, items, tickets, types] = await Promise.all([
      fetchAll<OrderInput>((from, to) => admin.from("orders")
        .select("id, buyer_name, buyer_email, buyer_phone, status, subtotal_cents, discount_cents, total_cents, created_at, paid_at, payment_method, custom_data")
        .eq("event_id", id).eq("org_id", event.org_id)
        .order("id").range(from, to)),
      fetchAll<ItemInput>((from, to) => admin.from("order_items")
        .select("order_id, ticket_type_id, quantity, unit_price_cents, orders!inner(event_id, org_id)")
        .eq("orders.event_id", id).eq("orders.org_id", event.org_id)
        .order("id").range(from, to)),
      fetchAll<TicketInput>((from, to) => admin.from("tickets")
        .select("order_id, status")
        .eq("event_id", id)
        .order("id").range(from, to)),
      fetchAll<{ id: string; name: string }>((from, to) => admin.from("ticket_types")
        .select("id, name").eq("event_id", id).order("price_cents", { ascending: false }).range(from, to)),
    ]);

    const orderIds = new Set(orders.map((o) => o.id));
    const typeNames = new Map(types.map((t) => [t.id, t.name]));
    // Defensa extra: solo partidas y boletos de órdenes de este evento/organización.
    const rows = buildRows(
      orders,
      items.filter((i) => orderIds.has(i.order_id)),
      tickets.filter((t) => orderIds.has(t.order_id)),
      typeNames,
    );
    const filtered = applyFilters(rows, filters);
    const accessRows = applyFilters(rows, { status: "paid", q: filters.q });

    const wb = buildBuyersWorkbook(filtered, accessRows, {
      eventTitle: event.title ?? "Evento",
      currency: event.currency ?? "mxn",
      timeZone: event.timezone ?? "America/Mexico_City",
      ticketTypes: types,
      customFields: parseCustomFields(event.custom_fields).map((f) => ({ key: f.key, label: f.label })),
      filters,
      financial,
      generatedAt: new Date(),
    }, view);
    const file = buildXlsx(wb);

    const base = slugPart(event.slug ?? event.title ?? id);
    const date = new Date().toISOString().slice(0, 10);
    const filename = view === "print" ? `lista-acceso-${base}-${date}.xlsx` : `compradores-${base}-${date}.xlsx`;
    return new Response(new Uint8Array(file), {
      headers: {
        "content-type": XLSX_MIME,
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "No se pudo generar el reporte" }, { status: 500 });
  }
}
