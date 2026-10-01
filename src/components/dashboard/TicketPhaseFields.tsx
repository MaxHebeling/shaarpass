"use client";

import { useState } from "react";
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
  const saleRow = toRow(sale);
  // Si la venta arranca justo cuando termina la preventa, trátalo como "enlazada":
  // dejamos el inicio vacío para mostrar "Inicia al terminar la preventa".
  if (presale && sale && sale.startsAt && presale.endsAt && sale.startsAt === presale.endsAt) {
    saleRow.startDate = "";
    saleRow.startTime = "";
  }
  return { presaleEnabled: !!presale, presale: toRow(presale), sale: saleRow };
}

function PhaseBlock({ title, row, onChange, accent, startHint }: { title: string; row: PhaseRowUI; onChange: (r: PhaseRowUI) => void; accent?: boolean; startHint?: string }) {
  const set = (patch: Partial<PhaseRowUI>) => onChange({ ...row, ...patch });
  const startEmpty = !row.startDate && !row.startTime;
  const [showStart, setShowStart] = useState(!startEmpty);
  // Con pista (venta) y sin inicio definido: mostramos la etiqueta en vez del campo vacío.
  const linked = Boolean(startHint) && startEmpty && !showStart;
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
          {linked ? (
            <button
              type="button"
              onClick={() => setShowStart(true)}
              className="flex w-full items-center justify-between rounded-lg border border-dashed border-fuchsia/40 bg-fuchsia-500/5 px-3 py-2 text-left text-[11px] text-muted transition hover:border-fuchsia/70"
            >
              <span>{startHint}</span>
              <span className="text-fuchsia">definir fecha</span>
            </button>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-1">
                <input type="date" value={row.startDate} onChange={(e) => set({ startDate: e.target.value })} className={field} />
                <input type="time" value={row.startTime} onChange={(e) => set({ startTime: e.target.value })} className={field} />
              </div>
              {startHint && (
                <button type="button" onClick={() => { set({ startDate: "", startTime: "" }); setShowStart(false); }} className="mt-1 text-[10px] text-muted underline-offset-2 hover:underline">
                  Dejar “{startHint.toLowerCase()}”
                </button>
              )}
            </>
          )}
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
          <PhaseBlock title="Venta" row={value.sale} onChange={(r) => onChange({ ...value, sale: r })} startHint="Inicia al terminar la preventa" />
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
