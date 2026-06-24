import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processNotificationJob, type ChangePayload } from "@/lib/notifications/eventChange";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Drena la cola de notificaciones (envío masivo escalable). Protegido con CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  const db = createAdminClient();
  const { data: jobs } = await db
    .from("notification_jobs")
    .select("id, event_id, log_id, payload, channels")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  let totalSent = 0;
  for (const job of jobs ?? []) {
    const { sent } = await processNotificationJob(db, job as { id: string; event_id: string; log_id: string | null; payload: ChangePayload; channels: string[] });
    totalSent += sent;
  }
  return NextResponse.json({ ok: true, jobs: jobs?.length ?? 0, sent: totalSent });
}
