import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const eventId = url.searchParams.get("eventId");
  const token = url.searchParams.get("token");
  if (!eventId || !token) return NextResponse.json({ error: "faltan parámetros" }, { status: 400 });

  const db = createPublicClient();
  const { data } = await db.rpc("queue_status", { p_event: eventId, p_token: token });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return NextResponse.json({ status: "unknown" });
  return NextResponse.json({ status: row.status, pos: row.pos, ahead: row.ahead, admitExpiresAt: row.admit_expires_at });
}
