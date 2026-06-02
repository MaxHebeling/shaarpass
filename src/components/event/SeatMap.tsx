"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, Armchair } from "lucide-react";
import { money } from "@/lib/money";
import { ourFeeCents } from "@/lib/ticketing/feeMath";

export interface SeatData {
  id: string;
  ticket_type_id: string;
  section: string;
  row_label: string;
  seat_num: number;
  pos_x: number;
  pos_y: number;
  status: "available" | "held" | "sold";
}
export interface TierInfo { id: string; name: string; price_cents: number; }

export function SeatMap({
  eventId, eventSlug, currency, seats, tiers,
}: { eventId: string; eventSlug: string; currency: string; seats: SeatData[]; tiers: TierInfo[] }) {
  const [selected, setSelected] = useState<Record<string, SeatData>>({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const tierMap = useMemo(() => new Map(tiers.map((t) => [t.id, t])), [tiers]);

  // Agrupa por sección → filas ordenadas.
  const sections = useMemo(() => {
    const map = new Map<string, SeatData[]>();
    for (const s of seats) {
      if (!map.has(s.section)) map.set(s.section, []);
      map.get(s.section)!.push(s);
    }
    return Array.from(map.entries()).map(([name, list]) => {
      const rows = new Map<string, SeatData[]>();
      for (const s of list) {
        if (!rows.has(s.row_label)) rows.set(s.row_label, []);
        rows.get(s.row_label)!.push(s);
      }
      const orderedRows = Array.from(rows.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, rl]) => [label, rl.sort((x, y) => x.seat_num - y.seat_num)] as const);
      return { name, rows: orderedRows };
    });
  }, [seats]);

  function toggle(s: SeatData) {
    if (s.status !== "available") return;
    setSelected((cur) => {
      const next = { ...cur };
      if (next[s.id]) delete next[s.id];
      else next[s.id] = s;
      return next;
    });
  }

  const chosen = Object.values(selected);
  const totals = useMemo(() => {
    const subtotal = chosen.reduce((sum, s) => sum + (tierMap.get(s.ticket_type_id)?.price_cents ?? 0), 0);
    const fee = ourFeeCents(subtotal, chosen.length, currency);
    return { subtotal, fee, total: subtotal + fee };
  }, [chosen, tierMap, currency]);

  function checkout() {
    setLoading(true);
    // Agrupa asientos por tier para el carrito.
    const byTier = new Map<string, SeatData[]>();
    for (const s of chosen) {
      if (!byTier.has(s.ticket_type_id)) byTier.set(s.ticket_type_id, []);
      byTier.get(s.ticket_type_id)!.push(s);
    }
    const items = Array.from(byTier.entries()).map(([ttId, list]) => ({
      ticketTypeId: ttId,
      name: tierMap.get(ttId)?.name ?? "Asiento",
      price_cents: tierMap.get(ttId)?.price_cents ?? 0,
      quantity: list.length,
      seatIds: list.map((s) => s.id),
      seatLabels: list.map((s) => `${s.section} ${s.row_label}${s.seat_num}`),
    }));
    sessionStorage.setItem(`cart:${eventSlug}`, JSON.stringify({ eventId, eventSlug, items, currency }));
    router.push(`/e/${eventSlug}/checkout`);
  }

  return (
    <div className="glass rounded-3xl p-5">
      <h3 className="font-display text-lg font-semibold">Elige tus asientos</h3>

      {/* Escenario */}
      <div className="brand-gradient mx-auto my-4 w-2/3 rounded-full py-1.5 text-center text-xs font-semibold tracking-widest text-ink">
        ESCENARIO
      </div>

      {/* Mapa */}
      <div className="space-y-5 overflow-x-auto pb-2">
        {sections.map((sec) => (
          <div key={sec.name}>
            <div className="mb-2 text-xs uppercase tracking-wide text-muted">{sec.name}</div>
            <div className="space-y-1.5">
              {sec.rows.map(([label, rowSeats]) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="w-5 shrink-0 text-center text-[11px] text-muted">{label}</span>
                  <div className="flex gap-1.5">
                    {rowSeats.map((s) => {
                      const isSel = !!selected[s.id];
                      const sold = s.status !== "available";
                      return (
                        <button
                          key={s.id}
                          onClick={() => toggle(s)}
                          disabled={sold}
                          title={`${s.section} ${s.row_label}${s.seat_num}`}
                          className={`grid h-7 w-7 place-items-center rounded-md text-[10px] font-medium transition
                            ${sold ? "cursor-not-allowed bg-surface-2/60 text-muted/40"
                              : isSel ? "brand-gradient text-ink scale-110"
                              : "bg-surface-2 text-fg hover:bg-fuchsia/30"}`}
                        >
                          {s.seat_num}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Leyenda */}
      <div className="mt-4 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-surface-2" /> Disponible</span>
        <span className="flex items-center gap-1.5"><i className="brand-gradient h-3 w-3 rounded" /> Tu selección</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-surface-2/60" /> Ocupado</span>
      </div>

      {/* Resumen */}
      <AnimatePresence>
        {chosen.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-4 border-t border-line pt-3 text-sm">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {chosen.map((s) => (
                  <span key={s.id} className="rounded-full bg-fuchsia/15 px-2 py-0.5 text-xs text-fg">
                    {s.section} {s.row_label}{s.seat_num}
                  </span>
                ))}
              </div>
              <div className="flex justify-between text-muted"><span>{chosen.length} asientos</span><span>{money(totals.subtotal, currency)}</span></div>
              <div className="flex justify-between text-muted"><span>Comisión (incluye procesamiento)</span><span>{money(totals.fee, currency)}</span></div>
              <div className="mt-1 flex justify-between font-display text-lg font-bold"><span>Total</span><span className="text-gold">{money(totals.total, currency)}</span></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={checkout} disabled={chosen.length === 0 || loading}
        className="brand-gradient mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-ink transition hover:scale-[1.01] disabled:opacity-40"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Armchair className="h-4 w-4" />}
        {chosen.length === 0 ? "Selecciona asientos" : "Continuar al pago"}
      </button>
    </div>
  );
}
