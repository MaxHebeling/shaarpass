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
  const dayId = new URL(req.url).searchParams.get("dayId");

  // Acceso POR DÍA: los ingresos se cuentan sobre ticket_checkins del día en curso
  // (o del día indicado); los registrados/emitidos son del evento completo.
  const { resolveCurrentDay } = await import("@/lib/ticketing/eventDay");
  const { data: days } = await db.from("event_days").select("id, starts_at, ends_at").eq("event_id", eventId).order("starts_at");
  const dayList = (days ?? []).map((d) => ({ id: d.id as string, starts_at: d.starts_at as string, ends_at: d.ends_at as string }));
  const chosen = dayId ? dayList.find((d) => d.id === dayId) ?? null : resolveCurrentDay(dayList);

  const [{ count: registered }, { count: capacityRow }] = await Promise.all([
    db.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", eventId).in("status", ["valid", "checked_in"]),
    db.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", eventId), // total emitidos
  ]);
  const { count: checkedIn } = chosen
    ? await db.from("ticket_checkins").select("id", { count: "exact", head: true }).eq("event_day_id", chosen.id)
    : { count: 0 };

  const reg = registered ?? 0;
  const cin = checkedIn ?? 0;
  return NextResponse.json({
    registered: reg,
    checkedIn: cin,
    pending: Math.max(0, reg - cin),
    total: capacityRow ?? reg,
    dayId: chosen?.id ?? null,
    days: dayList.length,
  });
}
