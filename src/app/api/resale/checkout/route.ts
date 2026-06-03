import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { resaleBuyerTotal } from "@/lib/ticketing/feeMath";

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
  const { data: listing } = await db
    .from("listings")
    .select("id, price_cents, status, events(currency)")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing || listing.status !== "active") {
    return NextResponse.json({ error: "Reventa no disponible" }, { status: 409 });
  }
  const currency = (listing.events as unknown as { currency: string } | null)?.currency ?? "usd";

  // Reserva atómica: evita que dos compradores paguen el mismo boleto.
  const { data: reserved } = await db.rpc("reserve_listing", { p_listing: listingId });
  if (!reserved) return NextResponse.json({ error: "Reventa ya no disponible" }, { status: 409 });

  // El comprador paga el precio + procesamiento (gross-up); el vendedor recibe el
  // precio íntegro. El payout se registra al confirmar (buy_listing).
  const total = resaleBuyerTotal(listing.price_cents, currency);
  try {
    const intent = await getStripe().paymentIntents.create(
      {
        amount: total,
        currency,
        receipt_email: buyerEmail,
        metadata: { kind: "resale", listing_id: listing.id, buyer_email: buyerEmail },
      },
      { idempotencyKey }
    );
    return NextResponse.json({ clientSecret: intent.client_secret, totalCents: total, priceCents: listing.price_cents, currency });
  } catch (e) {
    // Si falla crear el intent, libera el listing para que otro pueda comprarlo.
    await db.rpc("release_listing", { p_listing: listingId });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
