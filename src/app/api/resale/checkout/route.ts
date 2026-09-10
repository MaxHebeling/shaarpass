import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { resaleBuyerTotal } from "@/lib/ticketing/feeMath";
import { rateLimit, clientIp, retryAfterHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";

const Body = z.object({
  listingId: z.string().uuid(),
  buyerEmail: z.string().email(),
  idempotencyKey: z.string().min(8),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { listingId, buyerEmail, idempotencyKey } = parsed.data;

  const db = createAdminClient();
  const rl = await rateLimit({ key: `resale-checkout:${clientIp(req)}`, max: 20, windowSeconds: 60, db });
  if (!rl.ok) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429, headers: retryAfterHeaders(rl) });
  const { data: listing } = await db
    .from("listings")
    .select("id, price_cents, status, seller_email, events(currency)")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing || listing.status !== "active") {
    return NextResponse.json({ error: "Reventa no disponible" }, { status: 409 });
  }
  const currency = (listing.events as unknown as { currency: string } | null)?.currency ?? "usd";

  // Cargo DIRECTO: el comprador paga a la cuenta Connect del VENDEDOR (el dinero no
  // pasa por la plataforma). El vendedor debe estar conectado y habilitado para cobrar.
  const { data: seller } = await db
    .from("seller_accounts")
    .select("stripe_account_id, charges_enabled")
    .eq("email", listing.seller_email)
    .maybeSingle();
  if (!seller?.stripe_account_id || !seller.charges_enabled) {
    return NextResponse.json({ error: "El vendedor aún no puede recibir el pago" }, { status: 409 });
  }
  const sellerAccountId = seller.stripe_account_id;

  // Reserva atómica: evita que dos compradores paguen el mismo boleto.
  const { data: reserved } = await db.rpc("reserve_listing", { p_listing: listingId });
  if (!reserved) return NextResponse.json({ error: "Reventa ya no disponible" }, { status: 409 });

  // El comprador paga el precio + procesamiento (gross-up); Stripe le descuenta su
  // comisión a la cuenta del vendedor, que recibe el precio. La plataforma no cobra
  // margen en reventa (application_fee = 0).
  const total = resaleBuyerTotal(listing.price_cents, currency);
  try {
    const intent = await getStripe().paymentIntents.create(
      {
        amount: total,
        currency,
        receipt_email: buyerEmail,
        metadata: { kind: "resale", listing_id: listing.id, buyer_email: buyerEmail },
      },
      { idempotencyKey, stripeAccount: sellerAccountId }
    );
    return NextResponse.json({ clientSecret: intent.client_secret, connectedAccountId: sellerAccountId, totalCents: total, priceCents: listing.price_cents, currency });
  } catch (e) {
    // Si falla crear el intent, libera el listing para que otro pueda comprarlo.
    await db.rpc("release_listing", { p_listing: listingId });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
