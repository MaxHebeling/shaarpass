import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { computeFees } from "@/lib/ticketing/fees";
import { rateLimit, clientIp, retryAfterHeaders } from "@/lib/rateLimit";

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
  const rl = await rateLimit({ key: `season-checkout:${clientIp(req)}`, max: 20, windowSeconds: 60, db });
  if (!rl.ok) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429, headers: retryAfterHeaders(rl) });

  // Reusa una orden previa con la misma idempotency (reintentos del cliente).
  // El PI es un CARGO DIRECTO en la cuenta del organizador → retrieve con stripeAccount.
  const { data: prior } = await db
    .from("orders").select("id, stripe_payment_intent_id, organizations(stripe_account_id)").eq("idempotency_key", idempotencyKey).maybeSingle();
  if (prior?.stripe_payment_intent_id) {
    const acct = (prior.organizations as unknown as { stripe_account_id: string | null } | null)?.stripe_account_id ?? undefined;
    const pi = await getStripe().paymentIntents.retrieve(prior.stripe_payment_intent_id, acct ? { stripeAccount: acct } : undefined);
    return NextResponse.json({ orderId: prior.id, clientSecret: pi.client_secret, connectedAccountId: acct });
  }

  const { data: season } = await db
    .from("seasons")
    .select("id, org_id, currency, price_cents, status, organizations(stripe_account_id, charges_enabled, absorb_fees)")
    .eq("id", seasonId)
    .maybeSingle();
  if (!season || season.status !== "published") {
    return NextResponse.json({ error: "Abono no disponible" }, { status: 404 });
  }
  const org = season.organizations as unknown as { stripe_account_id: string | null; charges_enabled: boolean; absorb_fees: boolean };
  // Cargo directo: basta charges_enabled (el dinero cae en la cuenta del organizador).
  if (!org?.stripe_account_id || !org.charges_enabled) {
    return NextResponse.json({ error: "El organizador aún no puede recibir pagos" }, { status: 409 });
  }

  // Reserva atómica (abono + cupo en cada evento). Si algo está agotado → 409.
  const { data: reserved, error: resErr } = await db.rpc("reserve_season_pass", { p_season: seasonId });
  if (resErr) return NextResponse.json({ error: resErr.message }, { status: 500 });
  if (!reserved) return NextResponse.json({ error: "Abono agotado o sin cupo en algún evento" }, { status: 409 });

  const fees = computeFees(season.price_cents, 1, season.currency, 0, org.absorb_fees);
  const manageToken = crypto.randomUUID().replace(/-/g, "");

  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      season_id: seasonId,
      org_id: season.org_id,
      buyer_email: buyerEmail,
      status: "pending",
      subtotal_cents: fees.subtotalCents,
      platform_fee_cents: fees.applicationFeeCents,
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

  // CARGO DIRECTO sobre la cuenta Connect del organizador: el cargo vive en SU
  // cuenta (Stripe le descuenta su comisión ahí) y la plataforma cobra su margen
  // vía application_fee_amount. Así el dinero del organizador nunca pasa por el RFC
  // de la plataforma (requisito fiscal en México).
  const connectedAccountId = org.stripe_account_id;
  const intent = await getStripe().paymentIntents.create(
    {
      amount: fees.totalCents,
      currency: season.currency,
      application_fee_amount: fees.applicationFeeCents,
      payment_method_types: ["card"],
      receipt_email: buyerEmail,
      metadata: { kind: "season", order_id: order.id, season_id: seasonId },
    },
    { idempotencyKey, stripeAccount: connectedAccountId }
  );
  await db.from("orders").update({ stripe_payment_intent_id: intent.id }).eq("id", order.id);

  return NextResponse.json({ orderId: order.id, clientSecret: intent.client_secret, connectedAccountId, fees });
}
