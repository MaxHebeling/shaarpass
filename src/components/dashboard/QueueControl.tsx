"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users, Loader2, Save } from "lucide-react";
import { setQueueConfig } from "@/app/dashboard/actions";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function QueueControl({
  eventId, enabled: initEnabled, onsaleAt, waveSize: initWave,
}: { eventId: string; enabled: boolean; onsaleAt: string | null; waveSize: number }) {
  const [enabled, setEnabled] = useState(initEnabled);
  const [onsale, setOnsale] = useState(toLocalInput(onsaleAt));
  const [wave, setWave] = useState(initWave || 50);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function save() {
    setMsg(null);
    start(async () => {
      const res = await setQueueConfig({ eventId, enabled, onsaleAt: onsale || null, waveSize: wave });
      if (res?.error) { setMsg(res.error); return; }
      setMsg("✅ Guardado");
      router.refresh();
    });
  }

  return (
    <div className="glass rounded-3xl p-6">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
        <Users className="h-5 w-5 text-gold" /> Cola virtual (alta demanda)
      </h2>
      <p className="mb-4 text-sm text-muted">Para onsales masivos: sala de espera → posición aleatoria → admisión por oleadas.</p>

      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface/40 p-4">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-fuchsia" />
        <span className="text-sm">Activar cola para este evento</span>
      </label>

      {enabled && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs text-muted">Apertura de venta (onsale)
            <input type="datetime-local" value={onsale} onChange={(e) => setOnsale(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-surface/60 px-2.5 py-2 text-sm outline-none focus:border-fuchsia/60" />
          </label>
          <label className="text-xs text-muted">Tamaño de oleada (concurrentes)
            <input type="number" min={1} value={wave} onChange={(e) => setWave(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-line bg-surface/60 px-2.5 py-2 text-sm outline-none focus:border-fuchsia/60" />
          </label>
        </div>
      )}

      <button onClick={save} disabled={pending} className="brand-gradient mt-3 flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar cola
      </button>
      {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
    </div>
  );
}
