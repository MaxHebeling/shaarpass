import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { computeFees } from "@/lib/ticketing/fees";
import { validatePromo } from "@/lib/ticketing/promo";

export const runtime = "nodejs";

const Body = z.object({
  eventId: z.string().uuid(),
  buyerEmail: z.string().email(),
  sessionId: z.string().min(8),
  idempotencyKey: z.string().min(8),
  promoCode: z.string().max(40).optional(),
  items: z
    .array(z.object({
      ticketTypeId: z.string().uuid(),
      quantity: z.number().int().min(1).max(50),
      seatIds: z.array(z.string().uuid()).optional(),       // modelo viejo (tabla seats)
      eventSeatIds: z.array(z.string().uuid()).optional(),  // modelo nuevo (event_seats)
    }))
    .min(1),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
  const { eventId, buyerEmail, sessionId, idempotencyKey, promoCode, items } = parsed.data;
  const db = createAdminClient();

  // Idempotencia: si ya existe una orden con esta key, devuélvela tal cual.
  const { data: existing } = await db
    .from("orders")
    .select("id, stripe_payment_intent_id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ orderId: existing.id, reused: true });
  }

  // Trae evento + org (necesitamos la cuenta Connect para el destination charge).
  const { data: event } = await db
    .from("events")
    .select("id, org_id, currency, status, organizations(stripe_account_id, payouts_enabled)")
    .eq("id", eventId)
    .single();
  if (!event || event.status !== "published") {
    return NextResponse.json({ error: "evento no disponible" }, { status: 404 });
  }
  const org = event.organizations as unknown as { stripe_account_id: string | null; payouts_enabled: boolean };
  if (!org?.stripe_account_id || !org.payouts_enabled) {
    return NextResponse.json({ error: "organizador sin pagos habilitados" }, { status: 409 });
  }

  // Precios autoritativos desde la BD (nunca confíes en el cliente).
  const ids = items.map((i) => i.ticketTypeId);
  const { data: types } = await db
    .from("ticket_types")
    .select("id, price_cents, currency, event_id")
    .in("id", ids);
  if (!types || types.length !== ids.length || types.some((t) => t.event_id !== eventId)) {
    return NextResponse.json({ error: "tipos de boleto inválidos" }, { status: 400 });
  }
  const priceOf = new Map(types.map((t) => [t.id, t.price_cents]));

  // 1) Reserva inventario: asientos por evento (nuevo), asientos viejos, o cantidad (GA).
  for (const it of items) {
    if (it.eventSeatIds?.length) {
      const { error } = await db.rpc("hold_event_seats", { p_seat_ids: it.eventSeatIds, p_session: sessionId, p_ttl_minutes: 10 });
      if (error) return NextResponse.json({ error: "asiento no disponible", detail: error.message }, { status: 409 });
    } else if (it.seatIds?.length) {
      const { error } = await db.rpc("hold_seats", { p_seat_ids: it.seatIds, p_session: sessionId, p_ttl_minutes: 10 });
      if (error) return NextResponse.json({ error: "asiento no disponible", detail: error.message }, { status: 409 });
    } else {
      const { error } = await db.rpc("create_hold", {
        p_ticket_type: it.ticketTypeId,
        p_quantity: it.quantity,
        p_session_id: sessionId,
        p_ttl_minutes: 10,
      });
      if (error) return NextResponse.json({ error: "sin stock suficiente", detail: error.message }, { status: 409 });
    }
  }

  // 2) Subtotal bruto + descuento (promo) autoritativo + fee transparente.
  const grossCents = items.reduce((s, it) => s + (priceOf.get(it.ticketTypeId) ?? 0) * it.quantity, 0);
  const ticketCount = items.reduce((s, it) => s + it.quantity, 0);

  let discountCents = 0;
  let promoId: string | null = null;
  if (promoCode?.trim()) {
    const promo = await validatePromo(db, eventId, promoCode, grossCents);
    if (!promo.valid) {
      return NextResponse.json({ error: promo.message ?? "Código no válido" }, { status: 409 });
    }
    discountCents = promo.discountCents ?? 0;
    promoId = promo.promoId ?? null;
  }

  const subtotalCents = Math.max(0, grossCents - discountCents);
  const fees = computeFees(subtotalCents, ticketCount);

  // 3) Crea la orden (pending) + items.
  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      event_id: eventId,
      org_id: event.org_id,
      buyer_email: buyerEmail,
      status: "pending",
      subtotal_cents: subtotalCents,
      discount_cents: discountCents,
      promo_code_id: promoId,
      platform_fee_cents: fees.platformFeeCents,
      total_cents: fees.totalCents,
      currency: event.currency,
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();
  if (orderErr || !order) {
    return NextResponse.json({ error: "no se pudo crear la orden" }, { status: 500 });
  }
  await db.from("order_items").insert(
    items.map((it) => ({
      order_id: order.id,
      ticket_type_id: it.ticketTypeId,
      quantity: it.quantity,
      unit_price_cents: priceOf.get(it.ticketTypeId) ?? 0,
    }))
  );
  await db.from("ticket_holds").update({ order_id: order.id }).eq("session_id", sessionId).is("order_id", null);

  // Vincula los asientos reservados a la orden (para confirmar/reembolsar).
  const allSeatIds = items.flatMap((it) => it.seatIds ?? []);
  if (allSeatIds.length) {
    await db.from("seats").update({ order_id: order.id }).in("id", allSeatIds);
  }
  const allEventSeatIds = items.flatMap((it) => it.eventSeatIds ?? []);
  if (allEventSeatIds.length) {
    await db.from("event_seats").update({ order_id: order.id }).in("id", allEventSeatIds);
  }

  // 4) PaymentIntent con destination charge: el neto va al organizador,
  //    application_fee_amount = nuestra comisión transparente.
  const intent = await getStripe().paymentIntents.create(
    {
      amount: fees.totalCents,
      currency: event.currency,
      application_fee_amount: fees.platformFeeCents,
      transfer_data: { destination: org.stripe_account_id },
      receipt_email: buyerEmail,
      metadata: { order_id: order.id, event_id: eventId },
    },
    { idempotencyKey } // Stripe dedup del lado servidor
  );

  await db.from("orders").update({ stripe_payment_intent_id: intent.id }).eq("id", order.id);

  return NextResponse.json({
    orderId: order.id,
    clientSecret: intent.client_secret,
    fees,
  });
}
