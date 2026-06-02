"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Armchair, Loader2, Plus } from "lucide-react";
import { generateSeats } from "@/app/dashboard/actions";

export interface TierOption {
  id: string;
  name: string;
  is_seated: boolean;
  seat_count: number;
}

const field = "rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none transition focus:border-fuchsia/60";

export function SeatBuilder({ eventId, tiers }: { eventId: string; tiers: TierOption[] }) {
  const [tierId, setTierId] = useState(tiers[0]?.id ?? "");
  const [section, setSection] = useState("Sección A");
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function add() {
    setError(null);
    start(async () => {
      const res = await generateSeats({ ticketTypeId: tierId, eventId, section, rows, cols });
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="glass rounded-3xl p-6">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
        <Armchair className="h-5 w-5 text-gold" /> Asientos numerados
      </h2>
      <p className="mb-4 text-sm text-muted">Genera una sección de asientos (filas × columnas) para un tipo de boleto.</p>

      {tiers.some((t) => t.is_seated) && (
        <div className="mb-4 space-y-1 text-sm">
          {tiers.filter((t) => t.is_seated).map((t) => (
            <div key={t.id} className="flex justify-between rounded-xl border border-line bg-surface/40 px-4 py-2">
              <span className="font-medium">{t.name}</span>
              <span className="text-muted">{t.seat_count} asientos</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <select value={tierId} onChange={(e) => setTierId(e.target.value)} className={`${field} col-span-2 sm:col-span-1`}>
          {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="Sección" className={field} />
        <input type="number" min={1} max={40} value={rows} onChange={(e) => setRows(Number(e.target.value))} placeholder="Filas" className={field} />
        <input type="number" min={1} max={50} value={cols} onChange={(e) => setCols(Number(e.target.value))} placeholder="Columnas" className={field} />
      </div>
      <button onClick={add} disabled={pending || !tierId} className="brand-gradient mt-3 flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-ink transition hover:scale-[1.02] disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Generar {rows * cols} asientos
      </button>
      {error && <p className="mt-2 text-sm text-fuchsia">{error}</p>}
    </div>
  );
}
