import { NextResponse } from "next/server";
import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/public";
import { validatePromo } from "@/lib/ticketing/promo";

export const runtime = "nodejs";

const Body = z.object({
  eventId: z.string().uuid(),
  code: z.string().min(1).max(40),
  subtotalCents: z.number().int().min(0),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ valid: false, message: "Datos inválidos" }, { status: 400 });

  const db = createPublicClient();
  const result = await validatePromo(db, parsed.data.eventId, parsed.data.code, parsed.data.subtotalCents);
  return NextResponse.json(result);
}
