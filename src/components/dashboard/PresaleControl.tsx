"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, Loader2, Save, Dices } from "lucide-react";
import { setPresaleConfig, runPresaleLottery } from "@/app/dashboard/actions";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function PresaleControl({
  eventId, enabled: initEnabled, endsAt, registered, selected,
}: { eventId: string; enabled: boolean; endsAt: string | null; registered: number; selected: number }) {
  const [enabled, setEnabled] = useState(initEnabled);
  const [ends, setEnds] = useState(toLocalInput(endsAt));
  const [count, setCount] = useState(Math.max(1, Math.ceil(registered / 2)));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function save() {
    setMsg(null);
    start(async () => {
      const res = await setPresaleConfig({ eventId, enabled, endsAt: ends || null });
      if (res?.error) { setMsg(res.error); return; }
      setMsg("✅ Guardado"); router.refresh();
    });
  }
  function lottery() {
    setMsg(null);
    start(async () => {
      const res = await runPresaleLottery(eventId, count);
      if (res?.error) { setMsg(res.error); return; }
      setMsg(`🎲 ${res?.selected} seleccionados (códigos enviados)`); router.refresh();
    });
  }

  return (
    <div className="glass rounded-3xl p-6">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
        <Star className="h-5 w-5 text-gold" /> Verified Fan / Presale
      </h2>
      <p className="mb-4 text-sm text-muted">
        Registro previo + lotería de acceso anticipado. <strong className="text-fg">{registered}</strong> registrados · <strong className="text-gold">{selected}</strong> seleccionados.
      </p>

      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface/40 p-4">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-fuchsia" />
        <span className="text-sm">Activar presale para este evento</span>
      </label>

      {enabled && (
        <label className="mt-3 block text-xs text-muted">Fin del presale (después, venta general)
          <input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)}
            className="mt-1 w-full max-w-xs rounded-lg border border-line bg-surface/60 px-2.5 py-2 text-sm outline-none focus:border-fuchsia/60" />
        </label>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={save} disabled={pending} className="brand-gradient flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
        </button>
        {enabled && registered > 0 && (
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={registered} value={count} onChange={(e) => setCount(Number(e.target.value))}
              className="w-20 rounded-lg border border-line bg-surface/60 px-2.5 py-2 text-sm outline-none focus:border-fuchsia/60" />
            <button onClick={lottery} disabled={pending} className="flex items-center gap-2 rounded-xl border border-gold/40 px-4 py-2 text-sm font-medium text-gold disabled:opacity-50">
              <Dices className="h-4 w-4" /> Correr lotería
            </button>
          </div>
        )}
      </div>
      {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
    </div>
  );
}
