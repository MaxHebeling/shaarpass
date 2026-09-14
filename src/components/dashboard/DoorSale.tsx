"use client";

import { useState } from "react";
import { Loader2, DoorOpen, Check, ExternalLink } from "lucide-react";

interface DoorType { id: string; name: string; price_cents: number }

/** Registro / venta EN PUERTA: emite un boleto para alguien que paga por fuera
 *  (efectivo o tarjeta en puerta) el día del evento. No pasa por Stripe. */
export function DoorSale({ eventId, ticketTypes }: { eventId: string; ticketTypes: DoorType[] }) {
  const [typeId, setTypeId] = useState(ticketTypes[0]?.id ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState(""); // en pesos
  const [method, setMethod] = useState<"efectivo" | "tarjeta">("efectivo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneToken, setDoneToken] = useState<string | null>(null);

  if (ticketTypes.length === 0) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setDoneToken(null);
    try {
      const res = await fetch(`/api/dashboard/events/${eventId}/door-sale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketTypeId: typeId,
          buyerName: name,
          buyerEmail: email || undefined,
          amountCents: Math.round(Number(amount || "0") * 100),
          method,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `No se pudo registrar (HTTP ${res.status})`);
      setDoneToken(data.ticketToken ?? "");
      setName(""); setEmail(""); setAmount("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass mt-6 rounded-3xl p-6">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl brand-gradient text-ink"><DoorOpen className="h-4 w-4" /></span>
        <h2 className="font-display text-lg font-semibold">Venta en puerta</h2>
      </div>
      <p className="mt-1 text-sm text-muted">Registra a alguien que paga en puerta (efectivo o tarjeta). Se emite su boleto con QR y cuenta en el aforo. El cobro lo haces tú por fuera.</p>

      {doneToken !== null ? (
        <div className="mt-5 rounded-2xl bg-emerald-500/10 p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-300"><Check className="h-4 w-4" /> Boleto emitido</p>
          {doneToken ? (
            <a href={`/t/${doneToken}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-gold">
              Ver / escanear el QR <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
          <div><button onClick={() => setDoneToken(null)} className="mt-3 text-sm font-medium text-fg underline">Registrar otro</button></div>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-3">
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60">
            {ticketTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="Nombre del asistente"
              className="rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo (opcional)"
              className="rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="Monto cobrado (ej. 2000)"
              className="rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60" />
            <select value={method} onChange={(e) => setMethod(e.target.value as "efectivo" | "tarjeta")}
              className="rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60">
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta en puerta</option>
            </select>
          </div>
          {error && <p className="text-sm text-fuchsia">{error}</p>}
          <button type="submit" disabled={busy || !name || !amount}
            className="brand-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3 font-semibold text-ink transition hover:scale-[1.01] disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />} Emitir boleto en puerta
          </button>
        </form>
      )}
    </div>
  );
}
