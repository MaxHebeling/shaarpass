"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Minus, Plus, ShieldCheck, Loader2 } from "lucide-react";
import { money } from "@/lib/money";
import { ourFeeCents } from "@/lib/ticketing/feeMath";

export interface SelectableTicket {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  remaining: number;
  max_per_order: number;
}

export function TicketSelector({ eventId, eventSlug, tickets }: { eventId: string; eventSlug: string; tickets: SelectableTicket[] }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const currency = tickets[0]?.currency ?? "usd";

  const { count, subtotal, fee, total } = useMemo(() => {
    const count = Object.values(qty).reduce((a, b) => a + b, 0);
    const subtotal = tickets.reduce((s, t) => s + (qty[t.id] ?? 0) * t.price_cents, 0);
    const fee = ourFeeCents(subtotal, count, currency);
    return { count, subtotal, fee, total: subtotal + fee };
  }, [qty, tickets, currency]);

  function set(id: string, delta: number, max: number) {
    setQty((q) => {
      const next = Math.max(0, Math.min(max, (q[id] ?? 0) + delta));
      return { ...q, [id]: next };
    });
  }

  function checkout() {
    setLoading(true);
    const items = tickets
      .filter((t) => (qty[t.id] ?? 0) > 0)
      .map((t) => ({ ticketTypeId: t.id, name: t.name, price_cents: t.price_cents, quantity: qty[t.id] }));
    sessionStorage.setItem(`cart:${eventSlug}`, JSON.stringify({ eventId, eventSlug, items, currency }));
    router.push(`/e/${eventSlug}/checkout`);
  }

  return (
    <div className="glass rounded-3xl p-6">
      <h3 className="font-display text-lg font-semibold">Elige tus boletos</h3>

      <div className="mt-5 space-y-3">
        {tickets.map((t) => {
          const n = qty[t.id] ?? 0;
          const cap = Math.min(t.max_per_order, t.remaining);
          const low = t.remaining <= 25 && t.remaining > 0;
          const sold = t.remaining <= 0;
          return (
            <div key={t.id} className={`rounded-2xl border p-4 transition ${n > 0 ? "border-fuchsia/40 bg-fuchsia/5" : "border-line bg-surface/40"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{t.name}</div>
                  <div className="font-display text-lg font-bold text-gold">{money(t.price_cents, t.currency)}</div>
                  {low && <div className="mt-1 text-xs font-medium text-fuchsia">🔥 Solo quedan {t.remaining}</div>}
                  {sold && <div className="mt-1 text-xs font-medium text-muted">Agotado</div>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => set(t.id, -1, cap)}
                    disabled={n === 0}
                    className="grid h-9 w-9 place-items-center rounded-full border border-line text-fg transition hover:border-white/30 disabled:opacity-30"
                    aria-label="Quitar"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-6 text-center font-display text-lg font-bold tabular-nums">{n}</span>
                  <button
                    onClick={() => set(t.id, 1, cap)}
                    disabled={sold || n >= cap}
                    className="brand-gradient grid h-9 w-9 place-items-center rounded-full text-ink transition hover:scale-105 disabled:opacity-30 disabled:hover:scale-100"
                    aria-label="Agregar"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {count > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm">
              <Row label={`Subtotal (${count} ${count === 1 ? "boleto" : "boletos"})`} value={money(subtotal, currency)} />
              <Row label="Comisión de servicio" value={money(fee, currency)} muted hint="incluye procesamiento · transparente" />
              <Row label="Total" value={money(total, currency)} big />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={checkout}
        disabled={count === 0 || loading}
        className="brand-gradient mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-ink shadow-lg shadow-fuchsia/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {count === 0 ? "Selecciona boletos" : "Continuar al pago"}
      </button>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <ShieldCheck className="h-3.5 w-3.5 text-gold" /> Inventario garantizado · sin sobreventa
      </p>
    </div>
  );
}

function Row({ label, value, big, muted, hint }: { label: string; value: string; big?: boolean; muted?: boolean; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={muted ? "text-muted" : big ? "font-display text-base font-bold text-fg" : "text-fg"}>
        {label}
        {hint && <span className="ml-1 block text-[11px] text-muted">{hint}</span>}
      </span>
      <span className={big ? "font-display text-xl font-bold text-gold" : muted ? "text-muted" : "text-fg"}>{value}</span>
    </div>
  );
}
