"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Ban } from "lucide-react";
import { money } from "@/lib/money";

export interface OrderRow {
  id: string;
  buyer_email: string;
  total_cents: number;
  status: string;
  created_at: string;
}

export function OrdersPanel({
  eventId, currency, cancelled, initial,
}: { eventId: string; currency: string; cancelled: boolean; initial: OrderRow[] }) {
  const [orders, setOrders] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function refund(id: string) {
    setBusy(id); setError(null);
    try {
      const res = await fetch("/api/refund", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo reembolsar");
      setOrders((o) => o.map((x) => (x.id === id ? { ...x, status: "refunded" } : x)));
      router.refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  async function cancelEvent() {
    if (!confirm("¿Cancelar el evento y reembolsar todas las órdenes pagadas? Esto no se puede deshacer.")) return;
    setCanceling(true); setError(null);
    try {
      const res = await fetch("/api/events/cancel", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cancelar");
      router.refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setCanceling(false); }
  }

  const paid = orders.filter((o) => o.status === "paid").length;

  return (
    <div className="glass rounded-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Órdenes</h2>
        {!cancelled && (
          <button
            onClick={cancelEvent} disabled={canceling}
            className="flex items-center gap-2 rounded-full border border-fuchsia/40 px-4 py-2 text-sm font-medium text-fuchsia transition hover:bg-fuchsia/10 disabled:opacity-50"
          >
            {canceling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            Cancelar evento{paid > 0 ? ` (reembolsa ${paid})` : ""}
          </button>
        )}
        {cancelled && <span className="rounded-full bg-fuchsia/10 px-3 py-1 text-xs font-medium text-fuchsia">Evento cancelado</span>}
      </div>

      {error && <p className="mb-3 text-sm text-fuchsia">{error}</p>}

      {orders.length === 0 ? (
        <p className="text-sm text-muted">Aún no hay órdenes.</p>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-2xl border border-line bg-surface/40 px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{o.buyer_email}</div>
                <div className="text-xs text-muted">{new Date(o.created_at).toLocaleDateString("es-MX")}</div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-gold">{money(o.total_cents, currency)}</span>
                <StatusBadge status={o.status} />
                {o.status === "paid" && (
                  <button
                    onClick={() => refund(o.id)} disabled={busy === o.id}
                    className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs transition hover:border-fuchsia/50 hover:text-fuchsia disabled:opacity-50"
                  >
                    {busy === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    Reembolsar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-emerald-500/10 text-emerald-300",
    refunded: "bg-gold/10 text-gold",
    pending: "bg-surface-2 text-muted",
    failed: "bg-fuchsia/10 text-fuchsia",
    cancelled: "bg-fuchsia/10 text-fuchsia",
  };
  const label: Record<string, string> = { paid: "Pagada", refunded: "Reembolsada", pending: "Pendiente", failed: "Fallida", cancelled: "Cancelada" };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? "bg-surface-2 text-muted"}`}>{label[status] ?? status}</span>;
}
