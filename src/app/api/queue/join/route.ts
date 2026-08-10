import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/public";
import { verifyTurnstile } from "@/lib/turnstile";
import { isEdgeQueue, edgeJoin } from "@/lib/queue/edge";
import { rateLimit, clientIp, retryAfterHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";

const Body = z.object({ eventId: z.string().uuid(), turnstileToken: z.string().optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "payload inválido" }, { status: 400 });

  // Anti-bot
  if (!(await verifyTurnstile(parsed.data.turnstileToken))) {
    return NextResponse.json({ error: "Verificación anti-bot fallida" }, { status: 403 });
  }

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") ?? "";
  const identity = createHash("sha256").update(`${ip}|${ua}|${parsed.data.eventId}`).digest("hex");
  const token = crypto.randomUUID();

  const db = createPublicClient();

  // Rate limit: máx 20 intentos de unirse / minuto por IP (Upstash → Postgres → fail-open).
  const rl = await rateLimit({ key: `join:${ip}`, max: 20, windowSeconds: 60, db });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiados intentos, espera un momento" },
      { status: 429, headers: retryAfterHeaders(rl) },
    );
  }

  // Escala masiva: cola en el edge (Upstash) si está configurada.
  if (isEdgeQueue()) {
    const { data: ev } = await db.from("events").select("onsale_at, queue_wave_size").eq("id", parsed.data.eventId).maybeSingle();
    const res = await edgeJoin(parsed.data.eventId, ev?.onsale_at ?? null, ev?.queue_wave_size ?? 50);
    return NextResponse.json(res);
  }

  const { data, error } = await db.rpc("join_queue", { p_event: parsed.data.eventId, p_token: token, p_identity: identity });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  const row = Array.isArray(data) ? data[0] : data;

  return NextResponse.json({ token: row?.token ?? token, status: row?.status ?? "waiting", pos: row?.pos ?? null });
}
