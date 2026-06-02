import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";

export const runtime = "nodejs";

const Body = z.object({ orderId: z.string().uuid() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // RLS: solo miembros del org ven la orden.
  const { data: order } = await db
    .from("orders")
    .select("id, status, stripe_payment_intent_id")
    .eq("id", parsed.data.orderId)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "Orden no encontrada o sin permiso" }, { status: 404 });
  if (order.status === "refunded") return NextResponse.json({ ok: true, already: true });

  // 1) Reembolso en Stripe (si fue un pago real). Órdenes comp/seed no tienen PI.
  if (order.status === "paid" && order.stripe_payment_intent_id) {
    try {
      await getStripe().refunds.create({ payment_intent: order.stripe_payment_intent_id });
    } catch (e) {
      return NextResponse.json({ error: `Error de Stripe: ${(e as Error).message}` }, { status: 502 });
    }
  }

  // 2) Devuelve inventario, anula boletos, marca refunded (authz interna en la RPC).
  const { error } = await db.rpc("refund_order", { p_order_id: order.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  return NextResponse.json({ ok: true });
}
