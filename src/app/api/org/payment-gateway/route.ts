import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserOrg } from "@/lib/org";

export const runtime = "nodejs";

const Body = z.object({ gateway: z.enum(["stripe", "mercadopago"]) });

/** Cambia la pasarela de pago de la organización. Solo el dueño (RLS). No permite
 *  elegir Mercado Pago sin haberlo conectado (el checkout lo rechazaría). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "payload inválido" }, { status: 400 });

  const db = await createClient();
  const org = await getUserOrg(db);
  if (!org) return NextResponse.json({ error: "Sin organización" }, { status: 401 });

  if (parsed.data.gateway === "mercadopago" && !org.mp_connected) {
    return NextResponse.json({ error: "Conecta tu cuenta de Mercado Pago antes de elegirlo." }, { status: 409 });
  }

  const { error } = await db.from("organizations").update({ payment_gateway: parsed.data.gateway }).eq("id", org.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ ok: true, gateway: parsed.data.gateway });
}
