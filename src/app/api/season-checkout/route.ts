import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { computeFees } from "@/lib/ticketing/fees";

export const runtime = "nodejs";

const Body = z.object({
  seasonId: z.string().uuid(),
  buyerEmail: z.string().email(),
  idempotencyKey: z.string().min(8),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { seasonId, buyerEmail, idempotencyKey } = parsed.data;

  const db = createAdminClient();
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const { data: rlOk } = await db.rpc("hit_rate_limit", { p_key: `season-checkout:${ip}`, p_max: 20, p_window_seconds: 60 });
  if (rlOk === false) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  // Reusa una orden previa con la misma idempotency (reintentos del cliente).
  const { data: prior } = await db
    .from("orders").select("id, stripe_payment_intent_id").eq("idempotency_key", idempotencyKey).maybeSingle();
  if (prior?.stripe_payment_intent_id) {
    const pi = await getStripe().paymentIntents.retrieve(prior.stripe_payment_intent_id);
    return NextResponse.json({ orderId: prior.id, clientSecret: pi.client_secret });
  }

  const { data: season } = await db
    .from("seasons")
    .select("id, org_id, currency, price_cents, status, organizations(stripe_account_id, payouts_enabled)")
    .eq("id", seasonId)
    .maybeSingle();
  if (!season || season.status !== "published") {
    return NextResponse.json({ error: "Abono no disponible" }, { status: 404 });
  }
  const org = season.organizations as unknown as { stripe_account_id: string | null; payouts_enabled: boolean };
  if (!org?.stripe_account_id || !org.payouts_enabled) {
    return NextResponse.json({ error: "El organizador aún no puede recibir pagos" }, { status: 409 });
  }

  // Reserva atómica (abono + cupo en cada evento). Si algo está agotado → 409.
  const { data: reserved, error: resErr } = await db.rpc("reserve_season_pass", { p_season: seasonId });
  if (resErr) return NextResponse.json({ error: resErr.message }, { status: 500 });
  if (!reserved) return NextResponse.json({ error: "Abono agotado o sin cupo en algún evento" }, { status: 409 });

  const fees = computeFees(season.price_cents, 1, season.currency);
  const manageToken = crypto.randomUUID().replace(/-/g, "");

  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      season_id: seasonId,
      org_id: season.org_id,
      buyer_email: buyerEmail,
      status: "pending",
      subtotal_cents: fees.subtotalCents,
      platform_fee_cents: fees.platformFeeCents,
      total_cents: fees.totalCents,
      currency: season.currency,
      idempotency_key: idempotencyKey,
      manage_token: manageToken,
    })
    .select("id")
    .single();
  if (orderErr || !order) {
    await db.rpc("release_season_pass", { p_season: seasonId }); // devuelve el cupo
    return NextResponse.json({ error: "No se pudo crear la orden" }, { status: 500 });
  }

  // Destination charge: el neto va al organizador, application_fee = comisión.
  const intent = await getStripe().paymentIntents.create(
    {
      amount: fees.totalCents,
      currency: season.currency,
      application_fee_amount: fees.platformFeeCents,
      transfer_data: { destination: org.stripe_account_id },
      receipt_email: buyerEmail,
      metadata: { kind: "season", order_id: order.id, season_id: seasonId },
    },
    { idempotencyKey }
  );
  await db.from("orders").update({ stripe_payment_intent_id: intent.id }).eq("id", order.id);

  return NextResponse.json({ orderId: order.id, clientSecret: intent.client_secret, fees });
}
