import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";

export const runtime = "nodejs";

const Body = z.object({ listingId: z.string().uuid(), buyerEmail: z.string().email() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const db = createAdminClient();
  const { data: listing } = await db
    .from("listings")
    .select("id, price_cents, status, events(currency)")
    .eq("id", parsed.data.listingId)
    .maybeSingle();
  if (!listing || listing.status !== "active") {
    return NextResponse.json({ error: "Reventa no disponible" }, { status: 409 });
  }
  const currency = (listing.events as unknown as { currency: string } | null)?.currency ?? "usd";

  // El pago entra a la plataforma; el payout al vendedor se registra al confirmar.
  const intent = await getStripe().paymentIntents.create({
    amount: listing.price_cents,
    currency,
    receipt_email: parsed.data.buyerEmail,
    metadata: { kind: "resale", listing_id: listing.id, buyer_email: parsed.data.buyerEmail },
  });

  return NextResponse.json({ clientSecret: intent.client_secret, priceCents: listing.price_cents, currency });
}
