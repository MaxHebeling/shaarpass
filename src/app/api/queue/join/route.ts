import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/public";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";

const Body = z.object({ eventId: z.string().uuid(), turnstileToken: z.string().optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "payload inválido" }, { status: 400 });

  // Anti-bot
  if (!(await verifyTurnstile(parsed.data.turnstileToken))) {
    return NextResponse.json({ error: "Verificación anti-bot fallida" }, { status: 403 });
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const ua = req.headers.get("user-agent") ?? "";
  const identity = createHash("sha256").update(`${ip}|${ua}|${parsed.data.eventId}`).digest("hex");
  const token = crypto.randomUUID();

  const db = createPublicClient();

  // Rate limit: máx 20 intentos de unirse / minuto por IP.
  const { data: rlOk } = await db.rpc("hit_rate_limit", { p_key: `join:${ip}`, p_max: 20, p_window_seconds: 60 });
  if (rlOk === false) return NextResponse.json({ error: "Demasiados intentos, espera un momento" }, { status: 429 });
  const { data, error } = await db.rpc("join_queue", { p_event: parsed.data.eventId, p_token: token, p_identity: identity });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  const row = Array.isArray(data) ? data[0] : data;

  return NextResponse.json({ token: row?.token ?? token, status: row?.status ?? "waiting", pos: row?.pos ?? null });
}
