"use client";

import { useState, useTransition } from "react";
import { Loader2, Check, Plus } from "lucide-react";
import { updateTicketType, addTicketType } from "@/app/dashboard/actions";
import { money } from "@/lib/money";
import type { PricePhase } from "@/lib/ticketing/pricing";
import {
  TicketPhaseFields,
  pricingToPhases,
  phasesToPricing,
  defaultPricing,
  type TicketPricing,
} from "@/components/dashboard/TicketPhaseFields";

const field = "w-full rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60";

export interface PhaseSales { presaleQty: number; presaleRev: number; saleQty: number; saleRev: number }
export interface EditableTicket {
  id: string; name: string; price_cents: number; quantity_total: number; quantity_sold: number;
  phases: PricePhase[]; sales: PhaseSales | null;
}

export function TicketTypesEditor({
  eventId, currency, timezone, eventEndsAt, initial,
}: { eventId: string; currency: string; timezone: string; eventEndsAt: string | null; initial: EditableTicket[] }) {
  return (
    <div className="glass rounded-3xl p-6">
      <h2 className="mb-4 font-display text-lg font-semibold">Boletos</h2>
      <div className="space-y-3">
        {initial.map((t) => (
          <TicketRow key={t.id} eventId={eventId} currency={currency} timezone={timezone} eventEndsAt={eventEndsAt} t={t} />
        ))}
      </div>
      <div className="mt-5 border-t border-line pt-5">
        <AddTicket eventId={eventId} currency={currency} timezone={timezone} eventEndsAt={eventEndsAt} />
      </div>
    </div>
  );
}

function TicketRow({ eventId, currency, timezone, eventEndsAt, t }: {
  eventId: string; currency: string; timezone: string; eventEndsAt: string | null; t: EditableTicket;
}) {
  const [name, setName] = useState(t.name);
  const [qty, setQty] = useState(String(t.quantity_total));
  const [pricing, setPricing] = useState<TicketPricing>(
    t.phases.length ? phasesToPricing(t.phases, timezone) : defaultPricing(String(t.price_cents / 100))
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updateTicketType({
        id: t.id, eventId, name, quantity: Number(qty) || 0,
        phases: pricingToPhases(pricing, timezone), eventEndsAt,
      });
      setMsg(res?.error ? res.error : "✓ Guardado");
    });
  }

  const s = t.sales;
  return (
    <div className="rounded-2xl border border-line bg-surface/40 p-3">
      <div className="grid grid-cols-[1fr_110px] items-end gap-2">
        <div>
          <label className="mb-1 block text-[10px] text-muted">Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-muted">Cantidad total</label>
          <input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} className={field} />
        </div>
      </div>

      <div className="mt-3">
        <TicketPhaseFields value={pricing} onChange={setPricing} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-[11px] text-muted">
          <div>{t.quantity_sold}/{t.quantity_total} vendidos · {currency.toUpperCase()}</div>
          {s && (s.presaleQty > 0 || s.saleQty > 0) && (
            <div className="mt-0.5">
              {s.presaleQty > 0 && <span className="mr-2">Preventa: {s.presaleQty} ({money(s.presaleRev, currency)})</span>}
              {s.saleQty > 0 && <span>Venta: {s.saleQty} ({money(s.saleRev, currency)})</span>}
            </div>
          )}
        </div>
        <button onClick={save} disabled={pending}
          className="brand-gradient flex h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-ink disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
        </button>
      </div>
      {msg && <p className={`mt-1 text-[11px] ${msg.startsWith("✓") ? "text-emerald-400" : "text-fuchsia"}`}>{msg}</p>}
    </div>
  );
}

function AddTicket({ eventId, currency, timezone, eventEndsAt }: {
  eventId: string; currency: string; timezone: string; eventEndsAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [pricing, setPricing] = useState<TicketPricing>(defaultPricing());
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    setErr(null);
    start(async () => {
      const res = await addTicketType({
        eventId, currency, name, quantity: Number(qty) || 0,
        phases: pricingToPhases(pricing, timezone), eventEndsAt,
      });
      if (res?.error) setErr(res.error);
      else { setName(""); setQty(""); setPricing(defaultPricing()); setOpen(false); }
    });
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="flex items-center gap-2 text-sm text-muted transition hover:text-fg">
      <Plus className="h-4 w-4" /> Agregar tipo de boleto
    </button>
  );

  return (
    <div className="rounded-2xl border border-line bg-surface/40 p-3">
      <div className="grid grid-cols-[1fr_110px] items-end gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej. VIP)" className={field} />
        <input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Cant." className={field} />
      </div>
      <div className="mt-3"><TicketPhaseFields value={pricing} onChange={setPricing} /></div>
      {err && <p className="mt-2 text-sm text-fuchsia">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={add} disabled={pending} className="brand-gradient flex h-[40px] items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-ink disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar
        </button>
        <button onClick={() => setOpen(false)} className="rounded-xl px-4 text-sm text-muted transition hover:text-fg">Cancelar</button>
      </div>
    </div>
  );
}
