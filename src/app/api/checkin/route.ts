import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Result = "ok" | "already" | "invalid";

/** Registra el acceso de un boleto por su qr_token. La RLS garantiza que solo
 *  miembros (scanner+) del org del evento puedan verlo/actualizarlo. */
export async function POST(req: Request) {
  const { token } = await req.json().catch(() => ({ token: null }));
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
    .select("id, status, events(title, safetix_enabled), ticket_types(name), attendees(first_name, last_name)")
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

  if (ticket.status !== "valid") {
    return NextResponse.json({
      result: "already" as Result,
      message: ticket.status === "checked_in" ? "Ya registrado" : `Boleto ${ticket.status}`,
      event: ev?.title, type: tt?.name, attendee: who,
    });
  }

  // Update guardado: solo valid → checked_in (atómico; doble-scan = 0 filas).
  const { data: updated } = await db
    .from("tickets")
    .update({ status: "checked_in", checked_in_at: new Date().toISOString(), checked_in_by: user.id })
    .eq("qr_token", bearer)
    .eq("status", "valid")
    .select("id")
    .maybeSingle();

  if (!updated) {
    return NextResponse.json({ result: "already" as Result, message: "Ya registrado", event: ev?.title, type: tt?.name, attendee: who });
  }

  return NextResponse.json({ result: "ok" as Result, message: "¡Acceso!", event: ev?.title, type: tt?.name, attendee: who });
}
