import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Mapea el tipo de evento de Resend → (bandera en campaign_emails, contador en campaigns).
const MAP: Record<string, { flag: string; counter: string }> = {
  "email.delivered": { flag: "delivered", counter: "delivered" },
  "email.opened": { flag: "opened", counter: "opened" },
  "email.clicked": { flag: "clicked", counter: "clicked" },
  "email.bounced": { flag: "bounced", counter: "bounced" },
  "email.complained": { flag: "complained", counter: "unsub" },
};

function verifySvix(secret: string, headers: Headers, raw: string): boolean {
  const id = headers.get("svix-id"), ts = headers.get("svix-timestamp"), sig = headers.get("svix-signature");
  if (!id || !ts || !sig) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${raw}`).digest("base64");
  return sig.split(" ").some((p) => p.split(",")[1] === expected);
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    if (!verifySvix(secret, req.headers, raw)) return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  } else {
    console.warn("[resend-webhook] RESEND_WEBHOOK_SECRET no configurado — procesando sin verificar.");
  }

  let evt: { type?: string; data?: { email_id?: string; to?: string | string[] } };
  try { evt = JSON.parse(raw); } catch { return NextResponse.json({ error: "json inválido" }, { status: 400 }); }
  const m = evt.type ? MAP[evt.type] : undefined;
  const emailId = evt.data?.email_id;
  if (!m || !emailId) return NextResponse.json({ ok: true }); // evento no rastreado

  const db = createAdminClient();
  // Marca la bandera solo si estaba en false (conteo ÚNICO) y devuelve la campaña.
  const { data: updated } = await db
    .from("campaign_emails")
    .update({ [m.flag]: true })
    .eq("resend_id", emailId)
    .eq(m.flag, false)
    .select("campaign_id, email")
    .maybeSingle();

  if (updated) {
    await db.rpc("bump_campaign_metric", { p_campaign: updated.campaign_id, p_field: m.counter });
    // Una queja (spam) da de baja al destinatario del marketing.
    if (evt.type === "email.complained" && updated.email) {
      await db.from("email_optouts").upsert({ email: updated.email }, { onConflict: "email" }).then(undefined, () => {});
    }
  }
  return NextResponse.json({ ok: true });
}
