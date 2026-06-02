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
    .select("id, status, stripe_payment_intent_id, event_id, events(title)")
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

  // 3) Se liberó cupo → notifica a la lista de espera (best-effort, no bloquea).
  let notified = 0;
  try {
    const { data: wl } = await db
      .from("waitlist").select("id, email")
      .eq("event_id", order.event_id).is("notified_at", null)
      .order("created_at", { ascending: true }).limit(20);
    if (wl?.length) {
      const { sendBulkEmail } = await import("@/lib/email/campaigns");
      const title = (order.events as unknown as { title: string } | null)?.title ?? "el evento";
      const res = await sendBulkEmail(
        wl.map((w) => w.email),
        `¡Se liberaron lugares para ${title}!`,
        `Buenas noticias: se liberó cupo para ${title}. Corre a comprar tu boleto antes de que se agote de nuevo.`
      );
      notified = res.sent;
      await db.from("waitlist").update({ notified_at: new Date().toISOString() }).in("id", wl.map((w) => w.id));
    }
  } catch (e) { console.error("[waitlist] notify error", (e as Error).message); }

  return NextResponse.json({ ok: true, waitlistNotified: notified });
}
