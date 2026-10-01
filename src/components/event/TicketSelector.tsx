"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Minus, Plus, ShieldCheck, Loader2 } from "lucide-react";
import { money } from "@/lib/money";
import { ourFeeCents } from "@/lib/ticketing/feeMath";

export type SaleStatus = "presale" | "sale" | "upcoming" | "closed";
export interface SelectableTicket {
  id: string;
  name: string;
  price_cents: number; // precio VIGENTE (ya resuelto por fase en el servidor)
  currency: string;
  remaining: number;
  max_per_order: number;
  status?: SaleStatus;
  saleReferenceCents?: number | null; // precio de venta (tachado en preventa)
  activeUntil?: string | null; // fin de la fase vigente (cuenta regresiva)
  nextStartsAt?: string | null; // inicio de la próxima fase (si upcoming)
  nextKind?: "presale" | "sale" | null;
  phaseKind?: "presale" | "sale" | null;
}

function relFuture(iso: string): string {
  const diff = Date.parse(iso) - Date.now();
  if (diff <= 0) return "pronto";
  const d = Math.floor(diff / 86_400_000);
  if (d >= 1) return `en ${d} ${d === 1 ? "día" : "días"}`;
  const h = Math.floor(diff / 3_600_000);
  if (h >= 1) return `en ${h} h`;
  const m = Math.max(1, Math.floor(diff / 60_000));
  return `en ${m} min`;
}

export function TicketSelector({ eventId, eventSlug, tickets, absorbFees = false, timezone = "America/Mexico_City" }: { eventId: string; eventSlug: string; tickets: SelectableTicket[]; absorbFees?: boolean; timezone?: string }) {
  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: timezone }); } catch { return ""; }
  };
  const [qty, setQty] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const currency = tickets[0]?.currency ?? "usd";

  const { count, subtotal, fee, total } = useMemo(() => {
    const count = Object.values(qty).reduce((a, b) => a + b, 0);
    const subtotal = tickets.reduce((s, t) => s + (qty[t.id] ?? 0) * t.price_cents, 0);
    // Absorbido: el comprador paga el precio de lista (sin fee añadido).
    const fee = absorbFees ? 0 : ourFeeCents(subtotal, count, currency);
    return { count, subtotal, fee, total: subtotal + fee };
  }, [qty, tickets, currency, absorbFees]);

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
          const status = t.status ?? "sale";
          const purchasable = status === "presale" || status === "sale";
          const cap = Math.min(t.max_per_order, t.remaining);
          const low = purchasable && t.remaining <= 25 && t.remaining > 0;
          const sold = t.remaining <= 0;
          const disabledAdd = !purchasable || sold || n >= cap;
          return (
            <div key={t.id} className={`rounded-2xl border p-4 transition ${n > 0 ? "border-fuchsia/40 bg-fuchsia/5" : "border-line bg-surface/40"} ${!purchasable ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{t.name}</div>
                  {purchasable ? (
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-lg font-bold text-gold">{money(t.price_cents, t.currency)}</span>
                      {status === "presale" && t.saleReferenceCents != null && t.saleReferenceCents > t.price_cents && (
                        <span className="text-sm text-muted line-through">{money(t.saleReferenceCents, t.currency)}</span>
                      )}
                    </div>
                  ) : (
                    <div className="font-display text-base font-semibold text-muted">
                      {status === "upcoming" && t.saleReferenceCents != null ? money(t.saleReferenceCents, t.currency) : "—"}
                    </div>
                  )}
                  {status === "presale" && (
                    <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-fuchsia/15 px-2 py-0.5 text-[11px] font-semibold text-fuchsia">
                      Preventa{t.activeUntil ? <span className="font-normal text-muted">· termina {relFuture(t.activeUntil)}</span> : null}
                    </div>
                  )}
                  {status === "upcoming" && t.nextStartsAt && (
                    <div className="mt-1 text-xs text-muted">{t.nextKind === "presale" ? "Preventa" : "A la venta"} desde {fmtDate(t.nextStartsAt)}</div>
                  )}
                  {status === "closed" && <div className="mt-1 text-xs text-muted">Venta cerrada</div>}
                  {low && <div className="mt-1 text-xs font-medium text-fuchsia">🔥 Solo quedan {t.remaining}</div>}
                  {purchasable && sold && <div className="mt-1 text-xs font-medium text-muted">Agotado</div>}
                </div>
                {purchasable && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => set(t.id, -1, cap)}
                      disabled={n === 0}
                      className="grid h-11 w-11 place-items-center rounded-full border border-line text-fg transition hover:border-white/30 disabled:opacity-30"
                      aria-label="Quitar"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-6 text-center font-display text-lg font-bold tabular-nums">{n}</span>
                    <button
                      onClick={() => set(t.id, 1, cap)}
                      disabled={disabledAdd}
                      className="brand-gradient grid h-11 w-11 place-items-center rounded-full text-ink transition hover:scale-105 disabled:opacity-30 disabled:hover:scale-100"
                      aria-label="Agregar"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                )}
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
              {fee > 0 && <Row label="Comisión de servicio" value={money(fee, currency)} muted hint="incluye procesamiento · transparente" />}
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
