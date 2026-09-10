"use client";

import { useState } from "react";
import { Loader2, Check, Users, Wallet } from "lucide-react";

/** Selector del modelo de comisión del organizador.
 *  - passed (absorb=false): el comprador paga la comisión aparte; el organizador recibe íntegro.
 *  - absorbed (absorb=true): el comprador paga el precio de lista; el organizador absorbe la comisión. */
export function FeeModeToggle({ initial }: { initial: boolean }) {
  const [absorb, setAbsorb] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function choose(value: boolean) {
    if (value === absorb || saving) return;
    const prev = absorb;
    setAbsorb(value);
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/org/fee-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ absorb: value }),
      });
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error(data.error || `No se pudo guardar (HTTP ${res.status})`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setAbsorb(prev);
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass mt-6 rounded-3xl p-7">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Modelo de comisión</h2>
        {saving ? (
          <span className="flex items-center gap-1.5 text-xs text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…</span>
        ) : saved ? (
          <span className="flex items-center gap-1.5 text-xs text-emerald-300"><Check className="h-3.5 w-3.5" /> Guardado</span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted">Decide quién paga la comisión de servicio y de procesamiento.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Option
          selected={!absorb}
          disabled={saving}
          onClick={() => choose(false)}
          icon={Users}
          title="El comprador paga la comisión"
          body="Tus compradores ven una comisión de servicio sobre el precio. Tú recibes el precio íntegro."
        />
        <Option
          selected={absorb}
          disabled={saving}
          onClick={() => choose(true)}
          icon={Wallet}
          title="Yo absorbo la comisión"
          body="Tus compradores pagan exactamente el precio que pusiste. La comisión sale de lo que recibes."
        />
      </div>

      {error && <p className="mt-3 text-sm text-fuchsia">{error}</p>}
    </div>
  );
}

function Option({
  selected, disabled, onClick, icon: Icon, title, body,
}: {
  selected: boolean; disabled: boolean; onClick: () => void;
  icon: typeof Users; title: string; body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`relative rounded-2xl border p-4 text-left transition disabled:opacity-60 ${
        selected ? "border-fuchsia/60 bg-fuchsia/10" : "border-line bg-surface/40 hover:border-white/20"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${selected ? "brand-gradient text-ink" : "bg-surface-2 text-muted"}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="font-medium">{title}</span>
        {selected && <Check className="ml-auto h-4 w-4 text-fuchsia" />}
      </div>
      <p className="mt-2 text-xs text-muted">{body}</p>
    </button>
  );
}
