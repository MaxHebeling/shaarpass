"use client";

import { useState, useTransition } from "react";
import { Plus, Loader2 } from "lucide-react";
import { createSeason } from "@/app/dashboard/actions";
import { CURRENCIES } from "@/lib/currencies";

export function CreateSeasonForm() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("mxn");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const res = await createSeason({
        title, description, currency,
        price: Number(price) || 0,
        quantity: Number(quantity) || 0,
      });
      if (res?.error) setError(res.error);
      // éxito → redirect en el server action
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="brand-gradient flex items-center gap-2 rounded-2xl px-5 py-3 font-semibold text-ink">
        <Plus className="h-4 w-4" /> Nuevo abono
      </button>
    );
  }

  return (
    <div className="glass rounded-3xl p-6">
      <h2 className="mb-4 font-display text-lg font-semibold">Nuevo abono</h2>
      <div className="space-y-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (ej. Temporada 2026)"
          className="w-full rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm outline-none focus:border-fuchsia/60" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción (opcional)" rows={2}
          className="w-full rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm outline-none focus:border-fuchsia/60" />
        <div className="grid grid-cols-3 gap-3">
          <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" placeholder="Precio"
            className="rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm outline-none focus:border-fuchsia/60" />
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" min="0" placeholder="Cantidad"
            className="rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm outline-none focus:border-fuchsia/60" />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}
            className="rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm outline-none focus:border-fuchsia/60">
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code.toUpperCase()}</option>)}
          </select>
        </div>
        {error && <p className="text-sm text-fuchsia">{error}</p>}
        <div className="flex gap-2">
          <button onClick={submit} disabled={pending} className="brand-gradient flex items-center gap-2 rounded-2xl px-5 py-3 font-semibold text-ink disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crear
          </button>
          <button onClick={() => setOpen(false)} className="rounded-2xl border border-line px-5 py-3 text-sm text-muted">Cancelar</button>
        </div>
      </div>
    </div>
  );
}
