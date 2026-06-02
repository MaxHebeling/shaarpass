"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Sparkles } from "lucide-react";
import { createService, deleteService } from "@/app/dashboard/actions";
import { money } from "@/lib/money";

export interface ServiceRow {
  id: string; name: string; kind: string; price_cents: number; inventory: number | null; sold: number; max_per_order: number;
}

const field = "rounded-lg border border-line bg-surface/60 px-2.5 py-2 text-sm outline-none focus:border-fuchsia/60";
const KINDS = [["food", "🍔 Comida"], ["drink", "🥤 Bebida"], ["parking", "🅿️ Estacionamiento"], ["merch", "👕 Merch"], ["vip", "⭐ VIP"], ["access", "🎟️ Acceso"], ["extra", "✨ Extra"]] as const;

export function ServicesManager({ eventId, currency, initial }: { eventId: string; currency: string; initial: ServiceRow[] }) {
  const [services, setServices] = useState(initial);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("food");
  const [price, setPrice] = useState(50);
  const [inv, setInv] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function add() {
    setError(null);
    start(async () => {
      const res = await createService({ eventId, currency, name, kind, price, inventory: inv ? Number(inv) : null, maxPerOrder: 10 });
      if (res?.error) { setError(res.error); return; }
      setName(""); setInv("");
      router.refresh();
    });
  }

  function remove(id: string) {
    setServices((s) => s.filter((x) => x.id !== id));
    start(async () => { await deleteService(id, eventId); router.refresh(); });
  }

  return (
    <div className="glass rounded-3xl p-6">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
        <Sparkles className="h-5 w-5 text-gold" /> Servicios y extras
      </h2>
      <p className="mb-4 text-sm text-muted">Comida, estacionamiento, merch, VIP… el comprador los agrega al pagar.</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className={`${field} col-span-2 sm:col-span-1`} />
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
          {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(Number(e.target.value))} placeholder="Precio" className={field} />
        <input type="number" min={1} value={inv} onChange={(e) => setInv(e.target.value)} placeholder="Inventario (∞)" className={field} />
      </div>
      <button onClick={add} disabled={pending || !name.trim()} className="brand-gradient mt-3 flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar extra
      </button>
      {error && <p className="mt-2 text-sm text-fuchsia">{error}</p>}

      <div className="mt-5 space-y-2">
        {services.length === 0 && <p className="text-sm text-muted">Aún no hay extras.</p>}
        {services.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-2xl border border-line bg-surface/40 px-4 py-3 text-sm">
            <span className="flex items-center gap-2">
              {KINDS.find(([k]) => k === s.kind)?.[1]?.split(" ")[0]} {s.name}
              <span className="font-display font-bold text-gold">{money(s.price_cents, currency)}</span>
            </span>
            <div className="flex items-center gap-4 text-muted">
              <span className="text-xs">{s.sold}{s.inventory != null ? `/${s.inventory}` : ""} vendidos</span>
              <button onClick={() => remove(s.id)} className="transition hover:text-fuchsia"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
