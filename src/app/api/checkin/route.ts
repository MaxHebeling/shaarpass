import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCurrentDay } from "@/lib/ticketing/eventDay";

export const runtime = "nodejs";

type Result = "ok" | "already" | "invalid";

/** Registra el acceso de un boleto POR DÍA (acceso por día). Un boleto puede
 *  entrar una vez por cada día del evento. La RLS garantiza que solo miembros
 *  (scanner+) del org del evento puedan verlo/registrarlo. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token: string | null = body?.token ?? null;
  const forcedDayId: string | null = body?.eventDayId ?? null;
  const gate: string | null = typeof body?.gate === "string" ? body.gate : null;
  if (!token || typeof token !== "string") {
    return NextResponse.json({ result: "invalid" as Result, message: "Código inválido" }, { status: 400 });
  }

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ result: "invalid" as Result, message: "No autenticado" }, { status: 401 });

  // Código rotativo (SafeTix): payload = bearer.otp.counter → validar TOTP fresco.
  let bearer = token;
  if (token.includes(".")) {
    const [b, otp, counterStr] = token.split(".");
    bearer = b;
    const { data: valid } = await db.rpc("verify_rotating_code", { p_token: b, p_otp: otp, p_counter: Number(counterStr) });
    if (!valid) {
      return NextResponse.json({ result: "invalid" as Result, message: "Código expirado o inválido (rota cada 15s)" });
    }
  }

  // RLS: si no es miembro del org, no verá el boleto.
  const { data: ticket } = await db
    .from("tickets")
    .select("id, status, event_id, events(title, safetix_enabled), ticket_types(name), attendees(first_name, last_name)")
    .eq("qr_token", bearer)
    .maybeSingle();

  if (!ticket) {
    return NextResponse.json({ result: "invalid" as Result, message: "Boleto no encontrado o sin permiso" });
  }

  const ev = ticket.events as unknown as { title: string; safetix_enabled: boolean } | null;
  // Evento con SafeTix: exige el código rotativo (rechaza QR estático/screenshot).
  if (ev?.safetix_enabled && !token.includes(".")) {
    return NextResponse.json({ result: "invalid" as Result, message: "Este evento usa boleto seguro: abre tu boleto en la app (QR rotativo)" });
  }
  const tt = ticket.ticket_types as unknown as { name: string } | null;
  const at = ticket.attendees as unknown as { first_name: string | null; last_name: string | null } | null;
  const who = [at?.first_name, at?.last_name].filter(Boolean).join(" ") || null;
  const meta = { event: ev?.title, type: tt?.name, attendee: who };

  // Boleto anulado o reembolsado → no entra a ningún día.
  if (ticket.status === "void" || ticket.status === "refunded") {
    return NextResponse.json({ result: "already" as Result, message: `Boleto ${ticket.status}`, ...meta });
  }

  // Día del evento al que aplica el escaneo (el día en curso, o el forzado por el staff).
  const { data: days } = await db
    .from("event_days")
    .select("id, starts_at, ends_at, day_date")
    .eq("event_id", ticket.event_id)
    .order("starts_at");
  const dayList = (days ?? []).map((d) => ({ id: d.id as string, starts_at: d.starts_at as string, ends_at: d.ends_at as string }));
  const chosen = forcedDayId ? dayList.find((d) => d.id === forcedDayId) ?? null : resolveCurrentDay(dayList);
  if (!chosen) {
    return NextResponse.json({ result: "invalid" as Result, message: "El evento no tiene días configurados", ...meta });
  }
  const dayLabel = (days ?? []).find((d) => d.id === chosen.id)?.day_date as string | undefined;

  // Registro idempotente por (boleto, día): el UNIQUE evita doble ingreso el mismo día.
  const { error: insErr } = await db
    .from("ticket_checkins")
    .insert({ ticket_id: ticket.id, event_day_id: chosen.id, event_id: ticket.event_id, checked_in_by: user.id, gate });
  if (insErr) {
    // 23505 = unique_violation → ya entró ese día.
    if ((insErr as { code?: string }).code === "23505") {
      return NextResponse.json({ result: "already" as Result, message: dayLabel ? `Ya registrado (${dayLabel})` : "Ya registrado", ...meta });
    }
    return NextResponse.json({ result: "invalid" as Result, message: "No se pudo registrar el acceso", ...meta }, { status: 500 });
  }

  // Conveniencia: marca el último acceso en el boleto (informativo, no bloquea otros días).
  await db.from("tickets").update({ status: "checked_in", checked_in_at: new Date().toISOString(), checked_in_by: user.id }).eq("id", ticket.id);

  return NextResponse.json({ result: "ok" as Result, message: dayLabel ? `¡Acceso! (${dayLabel})` : "¡Acceso!", ...meta });
}
