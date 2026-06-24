import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unsubSig } from "@/lib/email/campaigns";

export interface Segment {
  type: "all" | "country" | "ticket_type" | "status" | "manual";
  countries?: string[];
  ticketTypes?: string[]; // ticket_type ids
  statuses?: string[];    // paid | pending | checked_in | not_checked_in
  emails?: string[];
}

export interface Recipient {
  email: string; firstName: string; lastName: string; country: string;
  ticketType: string; ticketTypeIds: string[]; status: string; checkedIn: boolean;
}

interface OrderRow {
  buyer_email: string | null; buyer_name: string | null; buyer_country: string | null; status: string;
  tickets: { status: string; ticket_type_id: string | null; ticket_types: { name: string } | null }[] | null;
}

/** Resuelve los destinatarios de una campaña según su segmento (datos reales de orders + tickets). */
export async function resolveRecipients(db: SupabaseClient, eventId: string, seg: Segment): Promise<Recipient[]> {
  const { data } = await db
    .from("orders")
    .select("buyer_email, buyer_name, buyer_country, status, tickets(status, ticket_type_id, ticket_types(name))")
    .eq("event_id", eventId);

  const byEmail = new Map<string, Recipient>();
  for (const o of (data ?? []) as unknown as OrderRow[]) {
    const email = (o.buyer_email ?? "").trim().toLowerCase();
    if (!email) continue;
    const tks = o.tickets ?? [];
    const ticketTypeIds = [...new Set(tks.map((t) => t.ticket_type_id).filter(Boolean) as string[])];
    const ticketType = tks[0]?.ticket_types?.name ?? "";
    const checkedIn = tks.some((t) => t.status === "checked_in");
    const [firstName, ...rest] = (o.buyer_name ?? "").trim().split(/\s+/);
    const r: Recipient = {
      email, firstName: firstName ?? "", lastName: rest.join(" "), country: o.buyer_country ?? "",
      ticketType, ticketTypeIds, status: o.status, checkedIn,
    };
    // Prioriza la orden pagada si hay varias del mismo correo.
    const prev = byEmail.get(email);
    if (!prev || (o.status === "paid" && prev.status !== "paid")) byEmail.set(email, r);
  }

  let list = [...byEmail.values()];
  switch (seg.type) {
    case "country":
      list = list.filter((r) => r.status === "paid" && (seg.countries ?? []).includes(r.country));
      break;
    case "ticket_type":
      list = list.filter((r) => r.status === "paid" && r.ticketTypeIds.some((id) => (seg.ticketTypes ?? []).includes(id)));
      break;
    case "status":
      list = list.filter((r) => {
        const s = seg.statuses ?? [];
        return (s.includes("paid") && r.status === "paid")
          || (s.includes("pending") && r.status === "pending")
          || (s.includes("checked_in") && r.checkedIn)
          || (s.includes("not_checked_in") && r.status === "paid" && !r.checkedIn);
      });
      break;
    case "manual": {
      const set = new Set((seg.emails ?? []).map((e) => e.toLowerCase()));
      list = list.filter((r) => set.has(r.email));
      break;
    }
    case "all":
    default:
      list = list.filter((r) => r.status === "paid");
  }

  // Excluir bajas de marketing.
  try {
    const { data: outs } = await db.from("email_optouts").select("email");
    const optedOut = new Set((outs ?? []).map((r) => (r.email as string).toLowerCase()));
    list = list.filter((r) => !optedOut.has(r.email));
  } catch { /* dev sin service role */ }

  return list;
}

function fillVars(text: string, r: Recipient, ev: { name: string; date: string }): string {
  return (text ?? "")
    .replace(/\{\{\s*firstName\s*\}\}/g, r.firstName)
    .replace(/\{\{\s*lastName\s*\}\}/g, r.lastName)
    .replace(/\{\{\s*email\s*\}\}/g, r.email)
    .replace(/\{\{\s*country\s*\}\}/g, r.country)
    .replace(/\{\{\s*eventName\s*\}\}/g, ev.name)
    .replace(/\{\{\s*eventDate\s*\}\}/g, ev.date)
    .replace(/\{\{\s*ticketType\s*\}\}/g, r.ticketType);
}

/** Plantilla HTML de la campaña con preheader, cuerpo y pie de baja. */
export function renderCampaignHtml(opts: { subject: string; preheader?: string; bodyHtml: string; unsubUrl: string }): string {
  const pre = opts.preheader
    ? `<span style="display:none;max-height:0;overflow:hidden;opacity:0">${opts.preheader}</span>`
    : "";
  return `${pre}
  <div style="max-width:560px;margin:0 auto;font-family:system-ui,sans-serif;background:#08080c;color:#f4f4f7;padding:32px;border-radius:24px">
    <div style="color:#e8e8ee;font-size:15px;line-height:1.65">${opts.bodyHtml}</div>
    <p style="color:#6b6b80;font-size:11px;margin-top:28px;border-top:1px solid #26263a;padding-top:16px">
      Enviado con ShaarPass · <a href="${opts.unsubUrl}" style="color:#9a9ab0">Darte de baja</a>
    </p>
  </div>`;
}

/** Envía un correo de PRUEBA con variables de ejemplo. */
export async function sendTest(opts: {
  to: string; subject: string; preheader?: string; bodyHtml: string; fromName?: string; replyTo?: string;
  eventName: string; eventDate: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.includes("REEMPLAZA")) return { sent: false, reason: "no_key" };
  const resend = new Resend(key);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.shaarpass.io";
  const fromEnv = process.env.EMAIL_FROM ?? "ShaarPass <onboarding@resend.dev>";
  const addr = fromEnv.match(/<(.+)>/)?.[1] ?? fromEnv;
  const from = opts.fromName ? `${opts.fromName} <${addr}>` : fromEnv;
  const sample: Recipient = { email: opts.to, firstName: "María", lastName: "González", country: "México", ticketType: "General", ticketTypeIds: [], status: "paid", checkedIn: false };
  const ev = { name: opts.eventName, date: opts.eventDate };
  const unsub = `${base}/unsubscribe?e=${encodeURIComponent(opts.to)}&s=${unsubSig(opts.to)}`;
  const subject = `[PRUEBA] ${fillVars(opts.subject, sample, ev)}`;
  const html = renderCampaignHtml({ subject, preheader: fillVars(opts.preheader ?? "", sample, ev), bodyHtml: fillVars(opts.bodyHtml, sample, ev), unsubUrl: unsub });
  try {
    await resend.emails.send({ from, to: opts.to, subject, html, replyTo: opts.replyTo || undefined });
    return { sent: true };
  } catch (e) { return { sent: false, reason: (e as Error).message }; }
}

/** Envía una campaña ya (resuelve, renderiza por destinatario, marca enviada). Idempotente por status. */
export async function sendCampaignNow(db: SupabaseClient, campaignId: string): Promise<{ sent: number; recipients: number; reason?: string }> {
  // Reclama la campaña (evita doble envío inline+cron).
  const { data: claimed } = await db.from("campaigns")
    .update({ status: "sending" }).eq("id", campaignId).in("status", ["draft", "scheduled"]).select("*").maybeSingle();
  if (!claimed) return { sent: 0, recipients: 0, reason: "already" };

  const { data: ev } = await db.from("events").select("title, starts_at, timezone").eq("id", claimed.event_id).maybeSingle();
  const eventName = ev?.title ?? "";
  const eventDate = ev?.starts_at ? new Date(ev.starts_at).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: ev?.timezone ?? "America/Mexico_City" }) : "";

  const recipients = await resolveRecipients(db, claimed.event_id, claimed.segment as Segment);

  const key = process.env.RESEND_API_KEY;
  if (!key || key.includes("REEMPLAZA")) {
    await db.from("campaigns").update({ status: "sent", recipients_count: recipients.length, sent_count: 0, sent_at: new Date().toISOString() }).eq("id", campaignId);
    return { sent: 0, recipients: recipients.length, reason: "no_key" };
  }
  const resend = new Resend(key);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.shaarpass.io";
  const fromEnv = process.env.EMAIL_FROM ?? "ShaarPass <onboarding@resend.dev>";
  const addr = fromEnv.match(/<(.+)>/)?.[1] ?? fromEnv;
  const from = claimed.from_name ? `${claimed.from_name} <${addr}>` : fromEnv;

  let sent = 0;
  const rows: { campaign_id: string; email: string; country: string; ticket_type: string; resend_id: string | null }[] = [];
  for (let i = 0; i < recipients.length; i += 20) {
    const batch = recipients.slice(i, i + 20);
    await Promise.all(batch.map(async (r) => {
      const unsub = `${base}/unsubscribe?e=${encodeURIComponent(r.email)}&s=${unsubSig(r.email)}`;
      const subject = fillVars(claimed.subject, r, { name: eventName, date: eventDate });
      const html = renderCampaignHtml({
        subject, preheader: fillVars(claimed.preheader ?? "", r, { name: eventName, date: eventDate }),
        bodyHtml: fillVars(claimed.body_html ?? "", r, { name: eventName, date: eventDate }), unsubUrl: unsub,
      });
      try {
        const { data } = await resend.emails.send({
          from, to: r.email, subject, html,
          replyTo: claimed.reply_to || undefined,
          headers: { "List-Unsubscribe": `<${unsub}>` },
          tags: [{ name: "campaign_id", value: campaignId }],
        });
        sent++;
        rows.push({ campaign_id: campaignId, email: r.email, country: r.country, ticket_type: r.ticketType, resend_id: data?.id ?? null });
      } catch (e) { console.error("[campaign] fallo a", r.email, (e as Error).message); }
    }));
  }

  // Registra los destinatarios para el tracking de aperturas/clics (webhook Resend).
  if (rows.length) await db.from("campaign_emails").upsert(rows, { onConflict: "campaign_id,email" });

  await db.from("campaigns").update({ status: "sent", recipients_count: recipients.length, sent_count: sent, sent_at: new Date().toISOString() }).eq("id", campaignId);
  return { sent, recipients: recipients.length };
}
