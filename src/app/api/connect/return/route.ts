import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";
import { getUserOrg } from "@/lib/org";

export const runtime = "nodejs";

/** El organizador regresa del onboarding de Stripe. Sincroniza el estado real
 *  de la cuenta y habilita pagos si ya puede cobrar + recibir transferencias. */
export async function GET() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3007";
  const db = await createClient();
  const org = await getUserOrg(db);

  if (org?.stripe_account_id) {
    const account = await getStripe().accounts.retrieve(org.stripe_account_id);
    const enabled = Boolean(
      account.charges_enabled && account.payouts_enabled && account.details_submitted
      && !account.requirements?.disabled_reason
    );
    await db.from("organizations").update({ payouts_enabled: enabled }).eq("id", org.id);
  }

  return NextResponse.redirect(new URL("/dashboard/pagos?synced=1", base));
}
