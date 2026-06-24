import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Un campo modificado, listo para mostrar en el correo y el log. */
export interface FieldChange { field: string; label: string; old: string; new: string; }

export interface ChangePayload {
  eventTitle: string;
  orgName: string;
  newDate: string;          // fecha legible
  newTime: string;          // horario legible
  newLocation: string;      // ubicación / modalidad legible
  changes: FieldChange[];   // resumen antes/después
}

interface Recipient { email: string; name: string | null; }

const esc = (s: string) => (s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));

/** HTML del correo de actualización, con resumen visual Antes / Ahora. */
export function buildChangeEmailHtml(p: ChangePayload, attendeeName: string): string {
  const beforeAfter = p.changes
    .map(
      (c) => `
      <tr>
        <td style="padding:8px 0;color:#9a9ab0;font-size:13px;vertical-align:top;width:90px">${esc(c.label)}</td>
        <td style="padding:8px 0;font-size:13px">
          <span style="color:#7a7a8c;text-decoration:line-through">${esc(c.old) || "—"}</span>
          <span style="color:#6b6b80"> → </span>
          <strong style="color:#f5c451">${esc(c.new) || "—"}</strong>
        </td>
      </tr>`
    )
    .join("");

  return `
  <div style="max-width:520px;margin:0 auto;font-family:system-ui,sans-serif;background:#08080c;color:#f4f4f7;padding:32px;border-radius:24px">
    <h1 style="font-size:20px;margin:0 0 6px">📢 Actualización importante de tu evento</h1>
    <p style="color:#9a9ab0;margin:0 0 18px">Hola ${esc(attendeeName) || "asistente"},</p>
    <p style="color:#d4d4dd;margin:0 0 8px">Se realizaron cambios en el evento:</p>
    <p style="font-size:18px;font-weight:700;margin:0 0 18px">${esc(p.eventTitle)}</p>

    <div style="border:1px solid #26263a;border-radius:16px;padding:16px 18px;background:#14141f;margin:0 0 16px">
      <div style="color:#9a9ab0;font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Información actualizada</div>
      <p style="margin:6px 0;font-size:14px">📅 <strong>Fecha:</strong> ${esc(p.newDate)}</p>
      <p style="margin:6px 0;font-size:14px">🕒 <strong>Horario:</strong> ${esc(p.newTime)}</p>
      <p style="margin:6px 0;font-size:14px">📍 <strong>Ubicación:</strong> ${esc(p.newLocation)}</p>
    </div>

    ${
      beforeAfter
        ? `<div style="border:1px solid #26263a;border-radius:16px;padding:8px 18px;background:#0e0e16;margin:0 0 16px">
             <div style="color:#9a9ab0;font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin:8px 0">Qué cambió</div>
             <table style="width:100%;border-collapse:collapse">${beforeAfter}</table>
           </div>`
        : ""
    }

    <p style="color:#9a9ab0;font-size:13px;margin:14px 0 0">Por favor revisa los nuevos detalles para evitar inconvenientes. Gracias por formar parte de este evento.</p>
    <p style="color:#6b6b80;font-size:12px;margin-top:18px">Equipo de ${esc(p.orgName) || "ShaarPass"}</p>
  </div>`;
}

/** Lee los asistentes activos (compradores con orden pagada), únicos por correo. */
async function loadRecipients(db: SupabaseClient, eventId: string): Promise<Recipient[]> {
  const { data } = await db
    .from("orders")
    .select("buyer_email, buyer_name")
    .eq("event_id", eventId)
    .eq("status", "paid");
  const map = new Map<string, Recipient>();
  for (const o of data ?? []) {
    const email = (o.buyer_email ?? "").trim().toLowerCase();
    if (email && !map.has(email)) map.set(email, { email, name: o.buyer_name ?? null });
  }
  return [...map.values()];
}

/** Cuenta de asistentes activos (para mostrar el total sin enviar). */
export async function countRecipients(db: SupabaseClient, eventId: string): Promise<number> {
  return (await loadRecipients(db, eventId)).length;
}

async function sendEmail(recipients: Recipient[], payload: ChangePayload): Promise<number> {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.includes("REEMPLAZA")) return 0;
  const resend = new Resend(key);
  const from = process.env.EMAIL_FROM ?? "ShaarPass <onboarding@resend.dev>";
  const subject = "📢 Actualización importante de tu evento";
  let sent = 0;
  // Resend batch: hasta 100 mensajes por llamada → escalable a miles.
  for (let i = 0; i < recipients.length; i += 100) {
    const chunk = recipients.slice(i, i + 100);
    try {
      await resend.batch.send(
        chunk.map((r) => ({ from, to: r.email, subject, html: buildChangeEmailHtml(payload, r.name ?? "") }))
      );
      sent += chunk.length;
    } catch (e) {
      console.error("[notif] batch error:", (e as Error).message);
    }
  }
  return sent;
}

/**
 * Procesa un job de notificación (idempotente: pending → processing → done).
 * Multicanal: hoy email; WhatsApp/SMS/Push quedan como ramas listas para implementar.
 */
export async function processNotificationJob(
  db: SupabaseClient,
  job: { id: string; event_id: string; log_id: string | null; payload: ChangePayload; channels: string[] }
): Promise<{ sent: number }> {
  // Reclama el job (evita doble envío entre inline y cron).
  const { data: claimed } = await db
    .from("notification_jobs")
    .update({ status: "processing", attempts: 1 })
    .eq("id", job.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) return { sent: 0 }; // ya lo tomó otro proceso

  const recipients = await loadRecipients(db, job.event_id);
  let sent = 0;
  for (const channel of job.channels) {
    if (channel === "email") sent += await sendEmail(recipients, job.payload);
    // else if (channel === "whatsapp") sent += await sendWhatsApp(recipients, job.payload);
    // else if (channel === "sms") sent += await sendSms(recipients, job.payload);
    // else if (channel === "push") sent += await sendPush(recipients, job.payload);
  }

  await db.from("notification_jobs").update({
    status: "done", sent_count: sent, recipients_count: recipients.length, processed_at: new Date().toISOString(),
  }).eq("id", job.id);

  if (job.log_id) {
    await db.from("event_change_log").update({
      recipients_count: recipients.length,
      status: sent >= recipients.length ? "sent" : sent > 0 ? "partial" : "error",
    }).eq("id", job.log_id);
  }
  return { sent };
}
