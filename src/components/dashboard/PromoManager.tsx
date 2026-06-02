"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tag, Trash2, Plus, Loader2 } from "lucide-react";
import { createPromo, deletePromo } from "@/app/dashboard/actions";

export interface PromoRow {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  max_redemptions: number | null;
  times_redeemed: number;
  expires_at: string | null;
}

const field = "rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none transition focus:border-fuchsia/60";

export function PromoManager({ eventId, currency, initial }: { eventId: string; currency: string; initial: PromoRow[] }) {
  const [promos, setPromos] = useState(initial);
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState(10);
  const [max, setMax] = useState("");
  const [expires, setExpires] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function add() {
    setError(null);
    start(async () => {
      const res = await createPromo({
        eventId, code, discountType: type, value,
        maxRedemptions: max ? Number(max) : null,
        expiresAt: expires || null,
      });
      if (res?.error) { setError(res.error); return; }
      setCode(""); setMax(""); setExpires("");
      router.refresh();
      // refresco optimista local
      setPromos((p) => [
        { id: crypto.randomUUID(), code: code.toUpperCase(), discount_type: type, discount_value: type === "fixed" ? Math.round(value * 100) : value, max_redemptions: max ? Number(max) : null, times_redeemed: 0, expires_at: expires || null },
        ...p,
      ]);
    });
  }

  function remove(id: string) {
    setPromos((p) => p.filter((x) => x.id !== id));
    start(async () => { await deletePromo(id, eventId); router.refresh(); });
  }

  const label = (p: PromoRow) =>
    p.discount_type === "percent" ? `${p.discount_value}% off` : `${(p.discount_value / 100).toLocaleString("es-MX", { style: "currency", currency: currency.toUpperCase() })} off`;

  return (
    <div className="glass rounded-3xl p-6">
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
        <Tag className="h-5 w-5 text-gold" /> Códigos promocionales
      </h2>

      {/* Crear */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CÓDIGO" className={`${field} col-span-2 sm:col-span-1 uppercase`} />
        <select value={type} onChange={(e) => setType(e.target.value as "percent" | "fixed")} className={field}>
          <option value="percent">% off</option>
          <option value="fixed">Monto off</option>
        </select>
        <input type="number" min={1} value={value} onChange={(e) => setValue(Number(e.target.value))} placeholder={type === "percent" ? "%" : "monto"} className={field} />
        <input type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} placeholder="Máx usos" className={field} />
        <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={field} />
      </div>
      <button onClick={add} disabled={pending || !code.trim()} className="brand-gradient mt-3 flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-ink transition hover:scale-[1.02] disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crear código
      </button>
      {error && <p className="mt-2 text-sm text-fuchsia">{error}</p>}

      {/* Lista */}
      <div className="mt-5 space-y-2">
        {promos.length === 0 && <p className="text-sm text-muted">Aún no hay códigos.</p>}
        {promos.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-2xl border border-line bg-surface/40 px-4 py-3">
            <div>
              <span className="font-display font-bold tracking-wide">{p.code}</span>
              <span className="ml-2 rounded-full bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold">{label(p)}</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted">
              <span>{p.times_redeemed}{p.max_redemptions ? `/${p.max_redemptions}` : ""} usos</span>
              <button onClick={() => remove(p.id)} className="transition hover:text-fuchsia"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
