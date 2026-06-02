"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { createVenueAndMap } from "@/app/dashboard/recintos/actions";

const field = "rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none transition focus:border-fuchsia/60";

export function CreateVenue() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [w, setW] = useState(60);
  const [h, setH] = useState(40);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function create() {
    setError(null);
    start(async () => {
      const res = await createVenueAndMap({ venueName: name, city, width: w, height: h });
      if (res?.error) { setError(res.error); return; }
      if (res?.mapId) router.push(`/dashboard/recintos/${res.mapId}`);
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="brand-gradient flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-ink transition hover:scale-[1.03]">
        <Plus className="h-4 w-4" /> Nuevo recinto
      </button>
    );
  }

  return (
    <div className="glass rounded-3xl p-6">
      <h3 className="mb-4 font-display text-lg font-semibold">Nuevo recinto</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del recinto" className={`${field} col-span-2`} />
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ciudad" className={field} />
        <div />
        <label className="text-xs text-muted">Ancho (m)<input type="number" min={5} value={w} onChange={(e) => setW(Number(e.target.value))} className={`${field} mt-1 w-full`} /></label>
        <label className="text-xs text-muted">Alto (m)<input type="number" min={5} value={h} onChange={(e) => setH(Number(e.target.value))} className={`${field} mt-1 w-full`} /></label>
      </div>
      {error && <p className="mt-2 text-sm text-fuchsia">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={create} disabled={pending || !name.trim()} className="brand-gradient flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} Crear y editar mapa
        </button>
        <button onClick={() => setOpen(false)} className="rounded-xl border border-line px-4 py-2 text-sm text-muted">Cancelar</button>
      </div>
    </div>
  );
}
