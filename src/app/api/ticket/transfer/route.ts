import { NextResponse } from "next/server";
import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/public";
import { rateLimit, clientIp, retryAfterHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";

const Body = z.object({ token: z.string().min(8), toEmail: z.string().email() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const db = createPublicClient();
  const rl = await rateLimit({ key: `tkt:transfer:${clientIp(req)}`, max: 10, windowSeconds: 60, db });
  if (!rl.ok) return NextResponse.json({ error: "Demasiados intentos, espera un momento" }, { status: 429, headers: retryAfterHeaders(rl) });

  const { data: newToken, error } = await db.rpc("transfer_ticket", { p_token: parsed.data.token, p_to_email: parsed.data.toEmail, p_kind: "transfer" });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  // Avisa al nuevo dueño con su enlace seguro (no-op sin Resend).
  try {
    const { sendBulkEmail } = await import("@/lib/email/campaigns");
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3007";
    await sendBulkEmail([parsed.data.toEmail], "Te transfirieron un boleto en ShaarPass",
      `Te transfirieron un boleto. Ábrelo aquí: ${base}/t/${newToken}`);
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, newToken });
}
