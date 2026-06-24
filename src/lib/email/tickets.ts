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
  safetix?: boolean;
  // Diseño del evento.
  coverImage?: string | null;
  eventSlug?: string | null;
  // Marca del organizador (white-label).
  logoUrl?: string | null;
  brand?: string | null;
  whiteLabel?: boolean;
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
    .map((t) =>
      p.safetix
        ? `
      <div style="border:1px solid #26263a;border-radius:16px;padding:20px;margin:12px 0;background:#14141f;text-align:center">
        <div style="color:#9a9ab0;font-size:13px;text-transform:uppercase;letter-spacing:.05em">${t.typeName}</div>
        <a href="${base}/t/${t.qr_token}" style="display:inline-block;margin-top:12px;background:linear-gradient(110deg,#a855f7,#d6219b,#f5c451);color:#08080c;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:12px">Ver mi boleto seguro</a>
        <div style="color:#6b6b80;font-size:11px;margin-top:10px">🔒 QR rotativo · ábrelo en la entrada</div>
      </div>`
        : `
      <div style="border:1px solid #26263a;border-radius:16px;padding:20px;margin:12px 0;background:#14141f;text-align:center">
        <div style="color:#9a9ab0;font-size:13px;text-transform:uppercase;letter-spacing:.05em">${t.typeName}</div>
        <img src="${base}/api/qr?token=${t.qr_token}" alt="QR" width="180" height="180" style="margin:12px auto;border-radius:12px;background:#fff;padding:8px" />
        <div style="color:#9a9ab0;font-size:11px;font-family:monospace">${t.qr_token.slice(0, 16)}…</div>
      </div>`
    )
    .join("");

  const logoHtml = p.logoUrl
    ? `<img src="${p.logoUrl}" alt="${p.brand ?? ""}" style="max-height:48px;max-width:180px;margin:0 0 16px;display:block" />`
    : "";

  // Diseño oficial del evento (imagen responsiva) + enlace para verlo en grande.
  const eventUrl = p.eventSlug ? `${base}/e/${p.eventSlug}` : null;
  const coverHtml = p.coverImage
    ? `<a href="${eventUrl ?? "#"}" style="text-decoration:none">
         <img src="${p.coverImage}" alt="${p.eventTitle}" width="100%" style="width:100%;max-width:456px;height:auto;border-radius:16px;display:block;margin:0 0 18px" />
       </a>`
    : "";
  const seeDesignHtml = eventUrl
    ? `<a href="${eventUrl}" style="display:inline-block;margin:4px 0 20px;color:#f5c451;font-weight:600;font-size:14px;text-decoration:none">🎨 Ver diseño del evento →</a>`
    : "";
  const footer = p.whiteLabel
    ? (p.brand ? `Enviado por ${p.brand}.` : "")
    : "Enviado por ShaarPass — te quedas con más de cada boleto.";

  const html = `
  <div style="max-width:520px;margin:0 auto;font-family:system-ui,sans-serif;background:#08080c;color:#f4f4f7;padding:32px;border-radius:24px">
    ${logoHtml}
    ${coverHtml}
    <h1 style="font-size:24px;margin:0 0 4px">🎟️ Tus boletos</h1>
    <p style="color:#9a9ab0;margin:0 0 12px">${p.eventTitle} · ${p.eventDate}</p>
    ${seeDesignHtml}
    ${ticketsHtml}
    <p style="color:#9a9ab0;font-size:13px;margin-top:20px">
      Total pagado: <strong style="color:#f5c451">${money(p.totalCents, p.currency)}</strong><br/>
      Presenta cada código QR en la entrada. ¡Nos vemos ahí!
    </p>
    ${footer ? `<p style="color:#6b6b80;font-size:11px;margin-top:24px">${footer}</p>` : ""}
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
