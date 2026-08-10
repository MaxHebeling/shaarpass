import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBulkEmail } from "@/lib/email/campaigns";
import { rateLimit, clientIp, retryAfterHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email().max(120),
  name: z.string().max(80).optional(),
  message: z.string().max(500).optional(),
  source: z.string().max(40).optional(),
});

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { email, name, message, source } = parsed.data;

  const ip = clientIp(req);
  const db = createAdminClient();

  // Rate limit: máx 5 envíos/min por IP (Upstash → Postgres → fail-open).
  const rl = await rateLimit({ key: `lead:${ip}`, max: 5, windowSeconds: 60, db });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiados envíos, espera un momento" },
      { status: 429, headers: retryAfterHeaders(rl) },
    );
  }

  const { error } = await db.from("leads").insert({
    email: email.toLowerCase(),
    name: name?.trim() || null,
    message: message?.trim() || null,
    source: source?.trim() || "web",
  });
  if (error) return NextResponse.json({ error: "No se pudo registrar" }, { status: 500 });

  // Auto-confirmación al prospecto + aviso interno (best-effort, no bloquea).
  try {
    await sendBulkEmail([email], "Recibimos tu mensaje — ShaarPass",
      `¡Gracias por tu interés en ShaarPass!\n\nRecibimos tus datos y te contactaremos muy pronto para ayudarte a montar tu evento.\n\nMientras tanto, puedes crear tu cuenta cuando quieras en https://www.shaarpass.io/login\n\n— Equipo ShaarPass`);
    const notify = `Nuevo lead (${esc(source ?? "web")})\n\nCorreo: ${esc(email)}\nNombre: ${esc(name ?? "—")}\nMensaje: ${esc(message ?? "—")}`;
    await sendBulkEmail(["tickets@shaarpass.io"], "🎯 Nuevo lead en ShaarPass", notify);
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true });
}
