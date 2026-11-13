import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { refundOrderPayment } from "@/lib/payments/refund";

export const runtime = "nodejs";

const Body = z.object({ eventId: z.string().uuid() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Reembolsos en Stripe de las órdenes pagadas con pago real (antes de marcar).
  const { data: orders } = await db
    .from("orders")
    .select("stripe_payment_intent_id, org_id, organizations(stripe_account_id)")
    .eq("event_id", parsed.data.eventId)
    .eq("status", "paid");

  // Idempotente (idempotency key por pago): si falla a la mitad, reintentar no duplica reembolsos.
  for (const o of orders ?? []) {
    const org = o.organizations as unknown as { stripe_account_id: string | null } | null;
    const r = await refundOrderPayment({ paymentId: o.stripe_payment_intent_id, stripeAccountId: org?.stripe_account_id, orgId: o.org_id });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  }

  // Marca evento cancelado + reembolsa órdenes en DB (authz interna).
  const { data, error } = await db.rpc("cancel_event", { p_event: parsed.data.eventId });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  return NextResponse.json({ ok: true, refunded: data });
}
