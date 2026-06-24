import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Estadísticas en vivo del evento (polling desde la app de check-in del staff). */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "falta token" }, { status: 400 });
  const db = createAdminClient();

  const { data: sessRows } = await db.rpc("staff_session", { p_token: token });
  const sess = Array.isArray(sessRows) ? sessRows[0] : sessRows;
  if (!sess || sess.revoked || sess.expired) return NextResponse.json({ error: "sesión inválida" }, { status: 403 });

  const eventId = sess.event_id;
  const base = db.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  const [{ count: registered }, { count: checkedIn }, { count: capacityRow }] = await Promise.all([
    base.in("status", ["valid", "checked_in"]),
    db.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "checked_in"),
    db.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", eventId), // total emitidos
  ]);

  const reg = registered ?? 0;
  const cin = checkedIn ?? 0;
  return NextResponse.json({
    registered: reg,
    checkedIn: cin,
    pending: Math.max(0, reg - cin),
    total: capacityRow ?? reg,
  });
}
