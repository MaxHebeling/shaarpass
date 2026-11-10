import type { createAdminClient } from "@/lib/supabase/admin";
import { CATEGORY_LABEL, type Category } from "./rules";

type Db = ReturnType<typeof createAdminClient>;

/**
 * Información MÍNIMA de protocolo para recepción (categoría de acceso, brazalete,
 * mesa). No expone cobertura, notas, contacto ni datos del comprador.
 * Devuelve null si el boleto no pertenece a un evento con el módulo activo. Nunca lanza.
 */
export async function checkinProtocolDetail(db: Db, ticketId: string, eventId: string): Promise<string | null> {
  try {
    const { data } = await db
      .from("protocol_people")
      .select("category, access_category, badge, protocol_table_assignments(protocol_tables(name))")
      .eq("ticket_id", ticketId).eq("event_id", eventId).maybeSingle();
    if (!data) return null;
    const { data: enabled } = await db.rpc("protocol_enabled_for_event", { p_event: eventId });
    if (enabled !== true) return null;
    const row = data as unknown as {
      category: Category | null; access_category: string | null; badge: string | null;
      protocol_table_assignments: { protocol_tables: { name: string } | null }[] | { protocol_tables: { name: string } | null } | null;
    };
    const asg = Array.isArray(row.protocol_table_assignments) ? row.protocol_table_assignments[0] : row.protocol_table_assignments;
    const parts = [
      row.access_category ?? (row.category ? CATEGORY_LABEL[row.category] : null),
      row.badge ? `Brazalete: ${row.badge}` : null,
      asg?.protocol_tables?.name ? `Mesa: ${asg.protocol_tables.name}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  } catch {
    return null;
  }
}
