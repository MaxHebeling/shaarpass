import { notFound } from "next/navigation";
import { CheckCircle2, Wallet, ShieldCheck } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { money } from "@/lib/money";
import { SellerPayoutButton } from "@/components/resale/SellerPayoutButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cobrar reventa | ShaarPass", robots: { index: false } };

export default async function ClaimPayout({ params }: { params: Promise<{ claimToken: string }> }) {
  const { claimToken } = await params;
  const db = createAdminClient();

  const { data: p } = await db
    .from("resale_payouts")
    .select("id, seller_email, amount_cents, status, listings(events(title, currency))")
    .eq("claim_token", claimToken)
    .maybeSingle<{ id: string; seller_email: string; amount_cents: number; status: string; listings: { events: { title: string; currency: string } | null } | null }>();
  if (!p) notFound();

  const ev = p.listings?.events;
  const currency = ev?.currency ?? "usd";
  const paid = p.status === "paid";

  // ¿Ya conectó cuenta habilitada?
  const { data: acct } = await db.from("seller_accounts").select("payouts_enabled").eq("email", p.seller_email).maybeSingle();
  const enabled = Boolean(acct?.payouts_enabled);

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300"><Wallet className="h-4 w-4" /> Cobro de reventa</div>
      <h1 className="font-display text-3xl font-bold">Tu boleto se vendió</h1>
      {ev?.title && <p className="mt-1 text-sm text-muted">{ev.title}</p>}

      <div className="glass mt-6 rounded-3xl p-6">
        <div className="text-sm text-muted">Te corresponde</div>
        <div className="font-display text-4xl font-bold text-gold">{money(p.amount_cents, currency)}</div>

        {paid ? (
          <div className="mt-5 flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3.5 text-sm text-emerald-300">
            <CheckCircle2 className="h-5 w-5" /> Pago enviado a tu cuenta. Llega según los tiempos de tu banco.
          </div>
        ) : enabled ? (
          <div className="mt-5 rounded-2xl border border-line bg-surface/40 px-4 py-3.5 text-sm text-muted">
            Tu cuenta está conectada. Estamos procesando el pago — se transfiere automáticamente.
          </div>
        ) : (
          <>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
              <ShieldCheck className="h-3.5 w-3.5 text-gold" /> Conecta una cuenta de cobro (Stripe) para recibir tu dinero. Toma 2 minutos.
            </p>
            <SellerPayoutButton claimToken={claimToken} />
          </>
        )}
      </div>
    </main>
  );
}
