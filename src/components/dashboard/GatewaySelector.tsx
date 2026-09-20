"use client";

import { useState } from "react";
import { Loader2, Check, CreditCard } from "lucide-react";

/** Selector de pasarela de pago del organizador: Stripe o Mercado Pago. */
export function GatewaySelector({ initial, mpConnected }: { initial: string; mpConnected: boolean }) {
  const [gateway, setGateway] = useState(initial === "mercadopago" ? "mercadopago" : "stripe");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(value: "stripe" | "mercadopago") {
    if (value === gateway || saving) return;
    if (value === "mercadopago" && !mpConnected) return; // primero conectar
    const prev = gateway;
    setGateway(value);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/org/payment-gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateway: value }),
      });
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error(data.error || `No se pudo guardar (HTTP ${res.status})`);
    } catch (e) {
      setGateway(prev);
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass mb-6 rounded-3xl p-7">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Procesador de pagos</h2>
        {saving && <span className="flex items-center gap-1.5 text-xs text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…</span>}
      </div>
      <p className="mt-1 text-sm text-muted">Elige con qué cobras. El dinero de cada venta llega directo a tu cuenta.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Option selected={gateway === "stripe"} disabled={saving} onClick={() => choose("stripe")}
          title="Stripe" body="Tarjetas nacionales e internacionales, OXXO y SPEI." />
        <Option selected={gateway === "mercadopago"} disabled={saving || !mpConnected} onClick={() => choose("mercadopago")}
          title="Mercado Pago" body="Tarjetas, OXXO, SPEI y meses sin intereses (MSI)." badge={mpConnected ? "Conectado" : undefined} />
      </div>

      {!mpConnected && (
        <a href="/api/mp/connect" className="mt-4 inline-flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-semibold transition hover:border-white/20">
          <CreditCard className="h-4 w-4" /> Conectar Mercado Pago
        </a>
      )}
      {error && <p className="mt-3 text-sm text-fuchsia">{error}</p>}
    </div>
  );
}

function Option({ selected, disabled, onClick, title, body, badge }: {
  selected: boolean; disabled: boolean; onClick: () => void; title: string; body: string; badge?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected}
      className={`relative rounded-2xl border p-4 text-left transition disabled:opacity-50 ${selected ? "border-fuchsia/60 bg-fuchsia/10" : "border-line bg-surface/40 hover:border-white/20"}`}>
      <div className="flex items-center gap-2">
        <span className="font-medium">{title}</span>
        {badge && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">{badge}</span>}
        {selected && <Check className="ml-auto h-4 w-4 text-fuchsia" />}
      </div>
      <p className="mt-2 text-xs text-muted">{body}</p>
    </button>
  );
}
