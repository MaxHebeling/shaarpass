import { Resend } from "resend";
import { money } from "@/lib/money";

export interface EmailTicket {
  qr_token: string;
  typeName: string;
}

export interface SendTicketsParams {
  to: string;
  eventTitle: string;
  eventDate: string;
  currency: string;
  totalCents: number;
  tickets: EmailTicket[];
}

/** Envía los boletos con QR por email (Resend). No-op si no hay key configurada. */
export async function sendTicketEmail(p: SendTicketsParams): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.includes("REEMPLAZA")) {
    console.warn("[email] RESEND_API_KEY no configurada — se omite el envío.");
    return { sent: false, reason: "no_key" };
  }
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3007";
  const resend = new Resend(key);

  const ticketsHtml = p.tickets
    .map(
      (t) => `
      <div style="border:1px solid #26263a;border-radius:16px;padding:20px;margin:12px 0;background:#14141f;text-align:center">
        <div style="color:#9a9ab0;font-size:13px;text-transform:uppercase;letter-spacing:.05em">${t.typeName}</div>
        <img src="${base}/api/qr?token=${t.qr_token}" alt="QR" width="180" height="180" style="margin:12px auto;border-radius:12px;background:#fff;padding:8px" />
        <div style="color:#9a9ab0;font-size:11px;font-family:monospace">${t.qr_token.slice(0, 16)}…</div>
      </div>`
    )
    .join("");

  const html = `
  <div style="max-width:520px;margin:0 auto;font-family:system-ui,sans-serif;background:#08080c;color:#f4f4f7;padding:32px;border-radius:24px">
    <h1 style="font-size:24px;margin:0 0 4px">🎟️ Tus boletos</h1>
    <p style="color:#9a9ab0;margin:0 0 20px">${p.eventTitle} · ${p.eventDate}</p>
    ${ticketsHtml}
    <p style="color:#9a9ab0;font-size:13px;margin-top:20px">
      Total pagado: <strong style="color:#f5c451">${money(p.totalCents, p.currency)}</strong><br/>
      Presenta cada código QR en la entrada. ¡Nos vemos ahí!
    </p>
    <p style="color:#6b6b80;font-size:11px;margin-top:24px">Enviado por ShaarPass — te quedas con más de cada boleto.</p>
  </div>`;

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "ShaarPass <onboarding@resend.dev>",
      to: p.to,
      subject: `Tus boletos para ${p.eventTitle}`,
      html,
    });
    return { sent: true };
  } catch (e) {
    console.error("[email] error al enviar:", e);
    return { sent: false, reason: (e as Error).message };
  }
}
