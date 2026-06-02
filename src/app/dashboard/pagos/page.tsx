import { CheckCircle2, AlertCircle, Zap, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUserOrg } from "@/lib/org";
import { ConnectButton } from "@/components/dashboard/ConnectButton";

export const dynamic = "force-dynamic";

export default async function PagosPage() {
  const db = await createClient();
  const org = await getUserOrg(db);
  const connected = Boolean(org?.stripe_account_id);
  const enabled = Boolean(org?.payouts_enabled);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl font-bold">Pagos</h1>
      <p className="mt-1 text-sm text-muted">Conecta tu cuenta para recibir el dinero de tus ventas.</p>

      <div className="glass mt-8 rounded-3xl p-7">
        <div className="flex items-start gap-4">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${enabled ? "bg-emerald-500/15 text-emerald-300" : connected ? "bg-gold/15 text-gold" : "brand-gradient text-ink"}`}>
            {enabled ? <CheckCircle2 className="h-6 w-6" /> : connected ? <AlertCircle className="h-6 w-6" /> : <Wallet className="h-6 w-6" />}
          </span>
          <div className="flex-1">
            <h2 className="font-display text-xl font-semibold">
              {enabled ? "Pagos activos" : connected ? "Casi listo" : "Conecta Stripe"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {enabled
                ? "Tu cuenta está lista. El dinero de cada venta llega directo a tu banco."
                : connected
                ? "Tu cuenta existe pero falta completar la verificación con Stripe."
                : "Usamos Stripe Connect: el cobro va a tu cuenta y nosotros solo retenemos la comisión transparente."}
            </p>

            <div className="mt-5">
              {!enabled && (
                <ConnectButton label={connected ? "Completar verificación" : "Conectar mi cuenta"} />
              )}
              {enabled && (
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300">
                  <Zap className="h-4 w-4" /> Listo para cobrar
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Perk title="Pagos directos" body="El dinero llega a tu cuenta de Stripe, no a un intermediario que lo retiene." />
        <Perk title="Comisión transparente" body="Solo 2% + $0.50 por boleto. Lo ves en cada venta, sin sorpresas." />
      </div>
    </div>
  );
}

function Perk({ title, body }: { title: string; body: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}
