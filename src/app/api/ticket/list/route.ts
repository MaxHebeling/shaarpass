import { NextResponse } from "next/server";
import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/public";

export const runtime = "nodejs";

const Body = z.object({ token: z.string().min(8), priceCents: z.number().int().min(0) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const db = createPublicClient();
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const { data: rlOk } = await db.rpc("hit_rate_limit", { p_key: `tkt:list:${ip}`, p_max: 10, p_window_seconds: 60 });
  if (rlOk === false) return NextResponse.json({ error: "Demasiados intentos, espera un momento" }, { status: 429 });

  const { data: listingId, error } = await db.rpc("list_ticket", { p_token: parsed.data.token, p_price_cents: parsed.data.priceCents });
  if (error) {
    const msg = error.message.includes("superar") ? error.message : "No se pudo poner en reventa";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
  return NextResponse.json({ ok: true, listingId });
}
