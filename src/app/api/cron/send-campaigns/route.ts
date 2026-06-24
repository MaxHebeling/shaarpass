import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCampaignNow } from "@/lib/email/campaignSend";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Envía las campañas programadas cuya fecha ya llegó. Protegido con CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "no autorizado" }, { status: 401 });

  const db = createAdminClient();
  const { data: due } = await db
    .from("campaigns")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(10);

  let total = 0;
  for (const c of due ?? []) {
    const res = await sendCampaignNow(db, c.id);
    total += res.sent;
  }
  return NextResponse.json({ ok: true, campaigns: due?.length ?? 0, sent: total });
}
