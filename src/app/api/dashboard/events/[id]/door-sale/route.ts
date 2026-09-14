import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const Body = z.object({
  ticketTypeId: z.string().uuid(),
  buyerName: z.string().trim().min(1).max(120),
  buyerEmail: z.string().email().optional().or(z.literal("")),
  amountCents: z.number().int().min(0).max(100_000_00),
  method: z.enum(["efectivo", "tarjeta"]),
});

/** Venta/registro EN PUERTA: el organizador cobra por fuera (efectivo/tarjeta en
 *  puerta) y aquí solo se REGISTRA — emite un boleto con QR y cuenta en el aforo.
 *  No pasa por Stripe. Solo miembros de la org del evento. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { ticketTypeId, buyerName, buyerEmail, amountCents, method } = parsed.data;

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const db = createAdminClient();
  const { data: event } = await db.from("events").select("id, org_id, currency").eq("id", id).maybeSingle();
  if (!event) return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  const { data: member } = await db.from("org_members").select("user_id").eq("org_id", event.org_id).eq("user_id", user.id).maybeSingle();
  if (!member) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { data: tt } = await db.from("ticket_types").select("id, event_id, is_seated").eq("id", ticketTypeId).maybeSingle();
  if (!tt || tt.event_id !== id) return NextResponse.json({ error: "Tipo de boleto inválido" }, { status: 400 });
  if (tt.is_seated) return NextResponse.json({ error: "Los boletos con asiento se venden desde el mapa, no en puerta." }, { status: 400 });

  // Orden pagada por fuera (efectivo/tarjeta en puerta). Sin comisión de plataforma.
  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      event_id: id,
      org_id: event.org_id,
      buyer_email: buyerEmail || `puerta+${crypto.randomUUID().slice(0, 8)}@shaarpass.io`,
      buyer_name: buyerName,
      status: "pending",
      subtotal_cents: amountCents,
      platform_fee_cents: 0,
      total_cents: amountCents,
      currency: event.currency,
      idempotency_key: `door_${crypto.randomUUID()}`,
      payment_method: `puerta-${method}`,
    })
    .select("id")
    .single();
  if (orderErr || !order) return NextResponse.json({ error: "No se pudo crear el registro" }, { status: 500 });

  await db.from("order_items").insert({ order_id: order.id, ticket_type_id: ticketTypeId, quantity: 1, unit_price_cents: amountCents });

  // Emite el boleto (crea el ticket con QR + incrementa vendidos; respeta el cupo).
  const { error: confirmErr } = await db.rpc("confirm_order_paid", { p_order_id: order.id, p_payment_intent_id: null });
  if (confirmErr) {
    // Sin cupo u otro error: limpia la orden a medias.
    await db.from("order_items").delete().eq("order_id", order.id);
    await db.from("orders").delete().eq("id", order.id);
    const sinCupo = confirmErr.message.includes("overselling");
    return NextResponse.json({ error: sinCupo ? "Sin cupo disponible para este tipo de boleto." : "No se pudo emitir el boleto." }, { status: 409 });
  }

  const { data: ticket } = await db.from("tickets").select("qr_token").eq("order_id", order.id).maybeSingle();
  return NextResponse.json({ ok: true, orderId: order.id, ticketToken: ticket?.qr_token ?? null });
}
