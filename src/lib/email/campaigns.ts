import { Resend } from "resend";

/** Envía un email a una lista de destinatarios (uno por uno, sin exponerse entre sí).
 *  No-op si no hay RESEND_API_KEY. Devuelve cuántos se enviaron. */
export async function sendBulkEmail(to: string[], subject: string, bodyText: string): Promise<{ sent: number; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.includes("REEMPLAZA")) {
    console.warn("[email] RESEND_API_KEY no configurada — se omite el envío masivo.");
    return { sent: 0, reason: "no_key" };
  }
  const from = process.env.EMAIL_FROM ?? "ShaarPass <onboarding@resend.dev>";
  const resend = new Resend(key);

  const html = `
  <div style="max-width:520px;margin:0 auto;font-family:system-ui,sans-serif;background:#08080c;color:#f4f4f7;padding:32px;border-radius:24px">
    <h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(subject)}</h1>
    <div style="color:#c8c8d4;font-size:15px;line-height:1.6;white-space:pre-line">${escapeHtml(bodyText)}</div>
    <p style="color:#6b6b80;font-size:11px;margin-top:28px">Enviado con ShaarPass.</p>
  </div>`;

  let sent = 0;
  // Lotes para no saturar; cap defensivo de 1000.
  const recipients = to.slice(0, 1000);
  for (let i = 0; i < recipients.length; i += 20) {
    const batch = recipients.slice(i, i + 20);
    await Promise.all(batch.map(async (addr) => {
      try { await resend.emails.send({ from, to: addr, subject, html }); sent++; }
      catch (e) { console.error("[email] fallo a", addr, (e as Error).message); }
    }));
  }
  return { sent };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
