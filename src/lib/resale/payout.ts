import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe/client";

export interface PayoutResult { ok: boolean; reason?: string; transferId?: string }

/**
 * Transfiere a un vendedor de reventa el monto que se le debe, desde el saldo
 * de la plataforma a su cuenta Stripe Connect. Idempotente: usa el id del payout
 * como idempotencyKey y solo marca 'paid' tras una transferencia exitosa.
 */
export async function processPayout(db: SupabaseClient, payoutId: string): Promise<PayoutResult> {
  // Datos del payout + moneda del evento (vía listing).
  const { data: p } = await db
    .from("resale_payouts")
    .select("id, listing_id, seller_email, amount_cents, status, listings(events(currency))")
    .eq("id", payoutId)
    .maybeSingle();
  if (!p) return { ok: false, reason: "payout no existe" };
  if (p.status === "paid") return { ok: true };           // ya pagado
  if (!p.seller_email) return { ok: false, reason: "sin email de vendedor" };

  // ¿El vendedor ya conectó una cuenta de cobro habilitada?
  const { data: acct } = await db
    .from("seller_accounts")
    .select("stripe_account_id, payouts_enabled")
    .eq("email", p.seller_email)
    .maybeSingle();
  if (!acct?.stripe_account_id || !acct.payouts_enabled) {
    return { ok: false, reason: "vendedor aún no conecta su cuenta de cobro" };
  }

  const currency =
    ((p.listings as unknown as { events: { currency: string } | null } | null)?.events?.currency) ?? "usd";

  const transfer = await getStripe().transfers.create(
    {
      amount: p.amount_cents,
      currency,
      destination: acct.stripe_account_id,
      metadata: { payout_id: p.id, kind: "resale_payout" },
    },
    { idempotencyKey: `resale_payout_${p.id}` }
  );

  await db.from("resale_payouts")
    .update({ status: "paid", stripe_transfer_id: transfer.id, paid_at: new Date().toISOString() })
    .eq("id", p.id);

  return { ok: true, transferId: transfer.id };
}

/** Barre todos los payouts pendientes cuyos vendedores ya pueden cobrar. */
export async function processOwedPayouts(db: SupabaseClient): Promise<{ paid: number; skipped: number }> {
  const { data: owed } = await db.from("resale_payouts").select("id").eq("status", "owed");
  let paid = 0, skipped = 0;
  for (const row of owed ?? []) {
    try {
      const res = await processPayout(db, row.id);
      if (res.ok && res.transferId) paid++; else skipped++;
    } catch { skipped++; } // saldo insuficiente / error transitorio → reintenta en la próxima corrida
  }
  return { paid, skipped };
}
