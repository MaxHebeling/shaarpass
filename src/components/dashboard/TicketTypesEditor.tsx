"use client";

import { useState, useTransition } from "react";
import { Loader2, Check, Plus } from "lucide-react";
import { updateTicketType, addTicketType } from "@/app/dashboard/actions";

const field = "w-full rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60";

export interface EditableTicket {
  id: string; name: string; price_cents: number; quantity_total: number; quantity_sold: number;
}

export function TicketTypesEditor({ eventId, currency, initial }: { eventId: string; currency: string; initial: EditableTicket[] }) {
  return (
    <div className="glass rounded-3xl p-6">
      <h2 className="mb-4 font-display text-lg font-semibold">Boletos</h2>
      <div className="space-y-3">
        {initial.map((t) => <TicketRow key={t.id} eventId={eventId} currency={currency} t={t} />)}
      </div>
      <div className="mt-5 border-t border-line pt-5">
        <AddTicket eventId={eventId} currency={currency} />
      </div>
    </div>
  );
}

function TicketRow({ eventId, currency, t }: { eventId: string; currency: string; t: EditableTicket }) {
  const [name, setName] = useState(t.name);
  const [price, setPrice] = useState(String(t.price_cents / 100));
  const [qty, setQty] = useState(String(t.quantity_total));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updateTicketType({ id: t.id, eventId, name, price: Number(price) || 0, quantity: Number(qty) || 0 });
      setMsg(res?.error ? res.error : "✓ Guardado");
    });
  }

  return (
    <div className="rounded-2xl border border-line bg-surface/40 p-3">
      <div className="grid grid-cols-[1fr_90px_90px_auto] items-end gap-2">
        <div>
          <label className="mb-1 block text-[10px] text-muted">Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-muted">Precio</label>
          <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={field} />
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-muted">Cantidad</label>
          <input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} className={field} />
        </div>
        <button onClick={save} disabled={pending}
          className="brand-gradient flex h-[42px] items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-ink disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
        <span>{t.quantity_sold}/{t.quantity_total} vendidos · {currency.toUpperCase()}</span>
        {msg && <span className={msg.startsWith("✓") ? "text-emerald-400" : "text-fuchsia"}>{msg}</span>}
      </div>
    </div>
  );
}

function AddTicket({ eventId, currency }: { eventId: string; currency: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    setErr(null);
    start(async () => {
      const res = await addTicketType({ eventId, currency, name, price: Number(price) || 0, quantity: Number(qty) || 0 });
      if (res?.error) setErr(res.error);
      else { setName(""); setPrice(""); setQty(""); setOpen(false); }
    });
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="flex items-center gap-2 text-sm text-muted transition hover:text-fg">
      <Plus className="h-4 w-4" /> Agregar tipo de boleto
    </button>
  );

  return (
    <div className="grid grid-cols-[1fr_90px_90px_auto] items-end gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej. VIP)" className={field} />
      <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Precio" className={field} />
      <input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Cant." className={field} />
      <button onClick={add} disabled={pending} className="brand-gradient flex h-[42px] items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-ink disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar
      </button>
      {err && <p className="col-span-full text-sm text-fuchsia">{err}</p>}
    </div>
  );
}
