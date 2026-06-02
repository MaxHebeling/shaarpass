import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";
import { getUserOrg } from "@/lib/org";

export const runtime = "nodejs";

/** Crea (o reutiliza) la cuenta Stripe Connect Express del organizador y
 *  devuelve un link de onboarding al que redirigir. */
export async function POST() {
  const db = await createClient();
  const org = await getUserOrg(db);
  if (!org) return NextResponse.json({ error: "Sin organización" }, { status: 401 });

  const stripe = getStripe();
  let accountId = org.stripe_account_id;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      metadata: { org_id: org.id },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: { name: org.name },
    });
    accountId = account.id;
    // El owner puede actualizar su org (RLS).
    await db.from("organizations").update({ stripe_account_id: accountId }).eq("id", org.id);
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3007";
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${base}/dashboard/pagos`,
    return_url: `${base}/api/connect/return`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: link.url });
}
