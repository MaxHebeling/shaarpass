import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Búsqueda manual de asistentes (nombre, correo, teléfono, # de boleto). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!token) return NextResponse.json({ error: "falta token" }, { status: 400 });
  if (q.length < 2) return NextResponse.json({ results: [] });
  const db = createAdminClient();

  const { data: sessRows } = await db.rpc("staff_session", { p_token: token });
  const sess = Array.isArray(sessRows) ? sessRows[0] : sessRows;
  if (!sess || sess.revoked || sess.expired) return NextResponse.json({ error: "sesión inválida" }, { status: 403 });
  const eventId = sess.event_id;

  const like = `%${q.replace(/[%_]/g, "")}%`;
  // Órdenes que coinciden por nombre/correo/teléfono.
  const { data: ords } = await db
    .from("orders")
    .select("id")
    .eq("event_id", eventId)
    .or(`buyer_name.ilike.${like},buyer_email.ilike.${like},buyer_phone.ilike.${like}`)
    .limit(25);
  const orderIds = (ords ?? []).map((o) => o.id);

  // Boletos de esas órdenes + coincidencia por # de boleto (token).
  let query = db
    .from("tickets")
    .select("id, qr_token, status, ticket_types(name), orders(buyer_name, buyer_email)")
    .eq("event_id", eventId)
    .limit(30);
  if (orderIds.length) query = query.or(`order_id.in.(${orderIds.join(",")}),qr_token.ilike.${q.replace(/[%_]/g, "")}%`);
  else query = query.ilike("qr_token", `${q.replace(/[%_]/g, "")}%`);

  const { data: tickets } = await query;
  const results = (tickets ?? []).map((t) => {
    const ord = t.orders as unknown as { buyer_name: string | null; buyer_email: string | null } | null;
    const tt = t.ticket_types as unknown as { name: string } | null;
    return {
      qrToken: t.qr_token,
      name: ord?.buyer_name || ord?.buyer_email || "Asistente",
      type: tt?.name ?? "Boleto",
      status: t.status,
    };
  });
  return NextResponse.json({ results });
}
