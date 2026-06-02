import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { processPayout } from "@/lib/resale/payout";

export const runtime = "nodejs";

/** El vendedor regresa del onboarding de Stripe. Sincroniza si ya puede recibir
 *  transferencias y, si quedaba un pago pendiente, lo libera de inmediato. */
export async function GET(req: Request) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3007";
  const url = new URL(req.url);
  const email = url.searchParams.get("email");
  const claim = url.searchParams.get("claim");
  const db = createAdminClient();

  if (email) {
    const { data: acct } = await db.from("seller_accounts").select("stripe_account_id").eq("email", email).maybeSingle();
    if (acct?.stripe_account_id) {
      const account = await getStripe().accounts.retrieve(acct.stripe_account_id);
      const enabled = Boolean(account.payouts_enabled && account.capabilities?.transfers === "active");
      await db.from("seller_accounts").update({ payouts_enabled: enabled }).eq("email", email);

      // Paga de inmediato lo que se le debía a este vendedor.
      if (enabled) {
        const { data: owed } = await db.from("resale_payouts").select("id").eq("seller_email", email).eq("status", "owed");
        for (const p of owed ?? []) { try { await processPayout(db, p.id); } catch { /* reintenta el cron */ } }
      }
    }
  }

  const dest = claim ? `/cobrar/${claim}?synced=1` : `/cobrar/listo`;
  return NextResponse.redirect(new URL(dest, base));
}
