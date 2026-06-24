import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Result = "ok" | "already" | "invalid";

/**
 * Check-in autenticado por TOKEN DE STAFF (sin login). Valida el token del
 * escáner, verifica el boleto (incl. código rotativo) y registra el acceso.
 */
export async function POST(req: Request) {
  const { staffToken, token, manual } = await req.json().catch(() => ({}));
  if (!staffToken || !token || typeof token !== "string") {
    return NextResponse.json({ result: "invalid" as Result, message: "Datos incompletos" }, { status: 400 });
  }
  const db = createAdminClient();

  // 1) Valida la sesión del staff.
  const { data: sessRows } = await db.rpc("staff_session", { p_token: staffToken });
  const sess = Array.isArray(sessRows) ? sessRows[0] : sessRows;
  if (!sess) return NextResponse.json({ result: "invalid" as Result, message: "Escáner no válido" }, { status: 401 });
  if (sess.revoked) return NextResponse.json({ result: "invalid" as Result, message: "Acceso de escáner revocado" }, { status: 403 });
  if (sess.expired) return NextResponse.json({ result: "invalid" as Result, message: "Enlace de escáner expirado" }, { status: 403 });

  // 2) Código rotativo (SafeTix): payload = bearer.otp.counter.
  //    En registro manual (override del staff) se usa el token tal cual.
  let bearer = token;
  const rotating = !manual && token.includes(".");
  if (rotating) {
    const [b, otp, counterStr] = token.split(".");
    bearer = b;
    const { data: valid } = await db.rpc("verify_rotating_code", { p_token: b, p_otp: otp, p_counter: Number(counterStr) });
    if (!valid) return NextResponse.json({ result: "invalid" as Result, message: "Código expirado o inválido (rota cada 15s)" });
  }

  // 3) El boleto debe existir y pertenecer al evento del escáner.
  const { data: ticket } = await db
    .from("tickets")
    .select("id, status, checked_in_at, checked_in_gate, event_id, ticket_types(name), attendees(first_name, last_name), orders(buyer_name)")
    .eq("qr_token", bearer)
    .maybeSingle();
  if (!ticket || ticket.event_id !== sess.event_id) {
    return NextResponse.json({ result: "invalid" as Result, message: "Boleto no encontrado para este evento" });
  }

  // SafeTix: exige código rotativo (rechaza screenshot estático), salvo override manual.
  if (sess.safetix_enabled && !rotating && !manual) {
    return NextResponse.json({ result: "invalid" as Result, message: "Boleto seguro: el asistente debe abrir su QR rotativo" });
  }

  const tt = ticket.ticket_types as unknown as { name: string } | null;
  const at = ticket.attendees as unknown as { first_name: string | null; last_name: string | null } | null;
  const ord = ticket.orders as unknown as { buyer_name: string | null } | null;
  const who = [at?.first_name, at?.last_name].filter(Boolean).join(" ") || ord?.buyer_name || null;

  if (ticket.status !== "valid") {
    return NextResponse.json({
      result: "already" as Result,
      message: ticket.status === "checked_in" ? "Este boleto ya fue utilizado" : `Boleto ${ticket.status}`,
      attendee: who, type: tt?.name, at: ticket.checked_in_at, gate: ticket.checked_in_gate,
    });
  }

  // 4) Marca atómica valid → checked_in (doble-scan = 0 filas).
  const nowIso = new Date().toISOString();
  const { data: updated } = await db
    .from("tickets")
    .update({ status: "checked_in", checked_in_at: nowIso, checked_in_by_staff: sess.staff_id, checked_in_gate: sess.gate })
    .eq("id", ticket.id)
    .eq("status", "valid")
    .select("id")
    .maybeSingle();

  if (!updated) {
    return NextResponse.json({ result: "already" as Result, message: "Este boleto ya fue utilizado", attendee: who, type: tt?.name });
  }

  // 5) Auditoría + actividad del escáner (no bloquea la respuesta si falla).
  await db.from("checkin_log").insert({ event_id: sess.event_id, ticket_id: ticket.id, staff_id: sess.staff_id, gate: sess.gate });
  await db.rpc("bump_staff_activity", { p_staff: sess.staff_id }).then(undefined, () => {});

  return NextResponse.json({ result: "ok" as Result, message: "¡Bienvenido!", attendee: who, type: tt?.name, at: nowIso, gate: sess.gate });
}
