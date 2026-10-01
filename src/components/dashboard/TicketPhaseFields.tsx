"use client";

import { wallTimeToISO, isoToWallParts } from "@/lib/datetime";
import type { PhaseInput, PricePhase } from "@/lib/ticketing/pricing";

const field = "w-full rounded-lg border border-line bg-surface/60 px-3 py-2 text-sm outline-none transition focus:border-fuchsia/60";
const lbl = "mb-1 block text-[11px] text-muted";

export interface PhaseRowUI {
  price: string;      // unidades de moneda
  startDate: string; startTime: string;
  endDate: string; endTime: string;
}

export interface TicketPricing {
  presaleEnabled: boolean;
  presale: PhaseRowUI;
  sale: PhaseRowUI;
}

const emptyPhase = (): PhaseRowUI => ({ price: "", startDate: "", startTime: "", endDate: "", endTime: "" });

export function defaultPricing(salePrice = ""): TicketPricing {
  return { presaleEnabled: false, presale: emptyPhase(), sale: { ...emptyPhase(), price: salePrice } };
}

function toISO(date: string, time: string, tz: string): string | null {
  if (!date || !time) return null;
  return wallTimeToISO(date, time, tz);
}

/** UI → fases (centavos + ISO). Siempre incluye 'sale'; 'presale' si está activa. */
export function pricingToPhases(p: TicketPricing, tz: string): PhaseInput[] {
  const phase = (row: PhaseRowUI, kind: "presale" | "sale"): PhaseInput => ({
    kind,
    priceCents: Math.round((parseFloat(row.price) || 0) * 100),
    startsAt: toISO(row.startDate, row.startTime, tz),
    endsAt: toISO(row.endDate, row.endTime, tz),
  });
  const out: PhaseInput[] = [];
  if (p.presaleEnabled) out.push(phase(p.presale, "presale"));
  out.push(phase(p.sale, "sale"));
  return out;
}

/** fases guardadas → UI (al editar). */
export function phasesToPricing(phases: PricePhase[], tz: string, currency = ""): TicketPricing {
  const toRow = (ph?: PricePhase): PhaseRowUI => {
    if (!ph) return emptyPhase();
    const s = ph.startsAt ? isoToWallParts(ph.startsAt, tz) : { date: "", time: "" };
    const e = ph.endsAt ? isoToWallParts(ph.endsAt, tz) : { date: "", time: "" };
    return { price: (ph.priceCents / 100).toString(), startDate: s.date, startTime: s.time, endDate: e.date, endTime: e.time };
  };
  const presale = phases.find((p) => p.kind === "presale");
  const sale = phases.find((p) => p.kind === "sale");
  return { presaleEnabled: !!presale, presale: toRow(presale), sale: toRow(sale) };
}

function PhaseBlock({ title, row, onChange, accent }: { title: string; row: PhaseRowUI; onChange: (r: PhaseRowUI) => void; accent?: boolean }) {
  const set = (patch: Partial<PhaseRowUI>) => onChange({ ...row, ...patch });
  return (
    <div className={`rounded-xl border p-3 ${accent ? "border-fuchsia/30 bg-fuchsia-500/5" : "border-line bg-surface/40"}`}>
      <div className="mb-2 text-xs font-semibold">{title}</div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr]">
        <div>
          <label className={lbl}>Precio</label>
          <input inputMode="decimal" value={row.price} onChange={(e) => set({ price: e.target.value })} placeholder="0.00" className={field} />
        </div>
        <div>
          <label className={lbl}>Inicia</label>
          <div className="grid grid-cols-2 gap-1">
            <input type="date" value={row.startDate} onChange={(e) => set({ startDate: e.target.value })} className={field} />
            <input type="time" value={row.startTime} onChange={(e) => set({ startTime: e.target.value })} className={field} />
          </div>
        </div>
        <div>
          <label className={lbl}>Termina</label>
          <div className="grid grid-cols-2 gap-1">
            <input type="date" value={row.endDate} onChange={(e) => set({ endDate: e.target.value })} className={field} />
            <input type="time" value={row.endTime} onChange={(e) => set({ endTime: e.target.value })} className={field} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TicketPhaseFields({ value, onChange }: { value: TicketPricing; onChange: (v: TicketPricing) => void }) {
  const preHigher =
    value.presaleEnabled &&
    parseFloat(value.presale.price || "0") >= parseFloat(value.sale.price || "0") &&
    value.sale.price !== "";

  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.presaleEnabled}
          onChange={(e) => onChange({ ...value, presaleEnabled: e.target.checked })}
          className="h-4 w-4 accent-fuchsia-500"
        />
        <span className="font-medium">Activar preventa</span>
        <span className="text-xs text-muted">(precio más bajo por tiempo limitado)</span>
      </label>

      {value.presaleEnabled ? (
        <>
          <PhaseBlock title="Preventa" row={value.presale} onChange={(r) => onChange({ ...value, presale: r })} accent />
          <PhaseBlock title="Venta" row={value.sale} onChange={(r) => onChange({ ...value, sale: r })} />
          {preHigher && (
            <p className="text-[11px] text-amber-400">El precio de preventa es mayor o igual al de venta.</p>
          )}
        </>
      ) : (
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
          <div>
            <label className={lbl}>Precio</label>
            <input inputMode="decimal" value={value.sale.price} onChange={(e) => onChange({ ...value, sale: { ...value.sale, price: e.target.value } })} placeholder="0.00" className={field} />
          </div>
          <div className="self-end text-[11px] text-muted">Venta abierta mientras el evento esté publicado.</div>
        </div>
      )}
    </div>
  );
}
