import { Resend } from "resend";
import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

function secret(): string {
  return process.env.QUEUE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "shaarpass";
}
/** Firma del enlace de baja, para que solo se pueda dar de baja un correo válido. */
export function unsubSig(email: string): string {
  return createHmac("sha256", secret()).update(`unsub:${email.toLowerCase()}`).digest("hex").slice(0, 24);
}

/** Envía un email a una lista de destinatarios (uno por uno, sin exponerse entre sí).
 *  Filtra a quienes se dieron de baja y agrega enlace de baja (anti-spam).
 *  No-op si no hay RESEND_API_KEY. Devuelve cuántos se enviaron. */
export async function sendBulkEmail(to: string[], subject: string, bodyText: string): Promise<{ sent: number; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.includes("REEMPLAZA")) {
    console.warn("[email] RESEND_API_KEY no configurada — se omite el envío masivo.");
    return { sent: 0, reason: "no_key" };
  }
  const from = process.env.EMAIL_FROM ?? "ShaarPass <onboarding@resend.dev>";
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.shaarpass.io";
  const resend = new Resend(key);

  // Excluir a quien se dio de baja de marketing (best-effort).
  let optedOut = new Set<string>();
  try {
    const db = createAdminClient();
    const { data } = await db.from("email_optouts").select("email");
    optedOut = new Set((data ?? []).map((r) => (r.email as string).toLowerCase()));
  } catch { /* sin service role en dev → no filtra */ }

  let sent = 0;
  const recipients = to.slice(0, 1000).filter((a) => !optedOut.has(a.toLowerCase()));
  for (let i = 0; i < recipients.length; i += 20) {
    const batch = recipients.slice(i, i + 20);
    await Promise.all(batch.map(async (addr) => {
      const unsub = `${base}/unsubscribe?e=${encodeURIComponent(addr)}&s=${unsubSig(addr)}`;
      const html = `
      <div style="max-width:520px;margin:0 auto;font-family:system-ui,sans-serif;background:#08080c;color:#f4f4f7;padding:32px;border-radius:24px">
        <h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(subject)}</h1>
        <div style="color:#c8c8d4;font-size:15px;line-height:1.6;white-space:pre-line">${escapeHtml(bodyText)}</div>
        <p style="color:#6b6b80;font-size:11px;margin-top:28px">
          Enviado con ShaarPass · <a href="${unsub}" style="color:#9a9ab0">Darte de baja</a>
        </p>
      </div>`;
      try {
        await resend.emails.send({ from, to: addr, subject, html, headers: { "List-Unsubscribe": `<${unsub}>` } });
        sent++;
      } catch (e) { console.error("[email] fallo a", addr, (e as Error).message); }
    }));
  }
  return { sent };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
