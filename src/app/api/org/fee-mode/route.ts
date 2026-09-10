import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserOrg } from "@/lib/org";

export const runtime = "nodejs";

const Body = z.object({ absorb: z.boolean() });

/** Cambia el modelo de comisión de la organización del usuario.
 *  absorb=true → el comprador paga el precio de lista y el organizador absorbe las
 *  comisiones. La RLS garantiza que solo el dueño pueda actualizar su org. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "payload inválido" }, { status: 400 });

  const db = await createClient();
  const org = await getUserOrg(db);
  if (!org) return NextResponse.json({ error: "Sin organización" }, { status: 401 });

  const { error } = await db
    .from("organizations")
    .update({ absorb_fees: parsed.data.absorb })
    .eq("id", org.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  return NextResponse.json({ ok: true, absorb_fees: parsed.data.absorb });
}
