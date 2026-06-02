import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { computeFees } from "@/lib/ticketing/fees";
import { validatePromo } from "@/lib/ticketing/promo";
import { isEdgeQueue, edgeAdmitted } from "@/lib/queue/edge";

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
  services: z.array(z.object({ serviceId: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).optional(),
  queueToken: z.string().optional(),
  presaleCode: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
  const { eventId, buyerEmail, sessionId, idempotencyKey, promoCode, items, services, queueToken, presaleCode } = parsed.data;
  const db = createAdminClient();

  // Rate limit por IP (anti-abuso): máx 30 intentos de checkout / minuto.
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const { data: rlOk } = await db.rpc("hit_rate_limit", { p_key: `checkout:${ip}`, p_max: 30, p_window_seconds: 60 });
  if (rlOk === false) return NextResponse.json({ error: "Demasiados intentos, espera un momento" }, { status: 429 });

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
    .select("id, org_id, currency, status, queue_enabled, onsale_at, queue_wave_size, max_tickets_per_buyer, presale_enabled, presale_ends_at, organizations(stripe_account_id, payouts_enabled)")
    .eq("id", eventId)
    .single();
  if (!event || event.status !== "published") {
    return NextResponse.json({ error: "evento no disponible" }, { status: 404 });
  }

  // Cola virtual: solo compradores admitidos pueden pagar.
  if (event.queue_enabled) {
    const admitted = isEdgeQueue()
      ? edgeAdmitted(eventId, queueToken ?? "", event.onsale_at ?? null, event.queue_wave_size ?? 50)
      : (await db.rpc("is_queue_admitted", { p_event: eventId, p_token: queueToken ?? "" })).data;
    if (!admitted) return NextResponse.json({ error: "Tu turno en la cola expiró o no es válido. Vuelve a la fila." }, { status: 403 });
  }

  // Presale (Verified Fan): durante la ventana, exige un código válido.
  const inPresale = event.presale_enabled && (!event.presale_ends_at || new Date(event.presale_ends_at) > new Date());
  if (inPresale) {
    const { data: ok } = await db.rpc("validate_presale_code", { p_event: eventId, p_code: presaleCode ?? "" });
    if (!ok) return NextResponse.json({ error: "Este evento está en presale: necesitas un código de acceso válido." }, { status: 403 });
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

  // Límite de boletos por comprador (anti-acaparamiento).
  if (event.max_tickets_per_buyer != null) {
    if (ticketCount > event.max_tickets_per_buyer) {
      return NextResponse.json({ error: `Máximo ${event.max_tickets_per_buyer} boletos por persona` }, { status: 409 });
    }
    const { data: prior } = await db.rpc("buyer_ticket_count", { p_event: eventId, p_email: buyerEmail });
    if ((prior ?? 0) + ticketCount > event.max_tickets_per_buyer) {
      return NextResponse.json({ error: `Ya alcanzaste el límite de ${event.max_tickets_per_buyer} boletos para este evento` }, { status: 409 });
    }
  }

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

  // Servicios/extras (validación de disponibilidad + total). Sin comisión de plataforma.
  let servicesTotal = 0;
  let svcRows: { service_id: string; quantity: number; unit_price_cents: number }[] = [];
  if (services?.length) {
    const svcIds = services.map((s) => s.serviceId);
    const { data: svc } = await db
      .from("services")
      .select("id, price_cents, inventory, sold, max_per_order, active, event_id")
      .in("id", svcIds);
    const byId = new Map((svc ?? []).map((s) => [s.id, s]));
    for (const s of services) {
      const def = byId.get(s.serviceId);
      if (!def || def.event_id !== eventId || !def.active) {
        return NextResponse.json({ error: "servicio inválido" }, { status: 400 });
      }
      if (s.quantity > def.max_per_order) {
        return NextResponse.json({ error: `máximo ${def.max_per_order} por orden` }, { status: 409 });
      }
      if (def.inventory != null && def.sold + s.quantity > def.inventory) {
        return NextResponse.json({ error: "servicio agotado" }, { status: 409 });
      }
      servicesTotal += def.price_cents * s.quantity;
      svcRows.push({ service_id: s.serviceId, quantity: s.quantity, unit_price_cents: def.price_cents });
    }
  }
  const orderTotal = fees.totalCents + servicesTotal;

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
      total_cents: orderTotal,
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
  if (svcRows.length) {
    await db.from("order_services").insert(svcRows.map((s) => ({ order_id: order.id, ...s })));
  }
  // Consume el turno en la cola (ya entró a comprar). El edge es por tiempo puro, no marca.
  if (event.queue_enabled && queueToken && !isEdgeQueue()) {
    await db.rpc("mark_queue_used", { p_token: queueToken });
  }
  // Consume el código de presale (un solo uso).
  if (inPresale && presaleCode) {
    await db.rpc("consume_presale_code", { p_event: eventId, p_code: presaleCode });
  }

  // 4) PaymentIntent con destination charge: el neto va al organizador,
  //    application_fee_amount = nuestra comisión transparente.
  const intent = await getStripe().paymentIntents.create(
    {
      amount: orderTotal,
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
