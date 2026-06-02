"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Loader2, ExternalLink, Globe, EyeOff, Copy } from "lucide-react";
import { money } from "@/lib/money";
import { addSeasonEvent, removeSeasonEvent, publishSeason } from "@/app/dashboard/actions";

export interface SeasonEventItem {
  eventId: string; eventTitle: string; startsAt: string; ticketTypeName: string; ticketTypePriceCents: number;
}
export interface PickableEvent {
  id: string; title: string; startsAt: string; ticketTypes: { id: string; name: string; price_cents: number }[];
}

export function SeasonEditor(props: {
  seasonId: string; slug: string; title: string; currency: string; priceCents: number;
  sold: number; total: number; status: string;
  current: SeasonEventItem[]; pickable: PickableEvent[];
}) {
  const { seasonId, slug, title, currency, priceCents, sold, total, status, current, pickable } = props;
  const [eventId, setEventId] = useState("");
  const [ticketTypeId, setTicketTypeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const chosen = pickable.find((p) => p.id === eventId);
  const published = status === "published";
  const sumIndiv = current.reduce((a, c) => a + c.ticketTypePriceCents, 0);

  function add() {
    if (!eventId || !ticketTypeId) { setError("Elige evento y tipo de boleto"); return; }
    setError(null);
    start(async () => {
      const res = await addSeasonEvent({ seasonId, eventId, ticketTypeId });
      if (res?.error) setError(res.error);
      else { setEventId(""); setTicketTypeId(""); }
    });
  }
  function remove(evId: string) {
    start(async () => { await removeSeasonEvent(seasonId, evId); });
  }
  function togglePublish() {
    setError(null);
    start(async () => {
      const res = await publishSeason(seasonId, !published);
      if (res?.error) setError(res.error);
    });
  }
  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/s/${slug}`);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted">
            Abono: <span className="text-gold">{money(priceCents, currency)}</span> · {sold}/{total} vendidos
            {sumIndiv > 0 && priceCents < sumIndiv && (
              <span className="ml-2 text-emerald-400">ahorro vs individual: {money(sumIndiv - priceCents, currency)}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {published && (
            <a href={`/s/${slug}`} target="_blank" rel="noreferrer" className="glass flex items-center gap-1.5 rounded-full px-3 py-2 text-xs">
              Ver <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button onClick={togglePublish} disabled={pending}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50 ${published ? "border border-line text-muted" : "brand-gradient text-ink"}`}>
            {published ? <><EyeOff className="h-3.5 w-3.5" /> Despublicar</> : <><Globe className="h-3.5 w-3.5" /> Publicar</>}
          </button>
        </div>
      </div>

      {published && (
        <button onClick={copyLink} className="glass mb-6 flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted transition hover:text-fg">
          <Copy className="h-3.5 w-3.5" /> {copied ? "¡Copiado!" : `${typeof window !== "undefined" ? window.location.origin : ""}/s/${slug}`}
        </button>
      )}

      {/* Eventos en el abono */}
      <div className="glass mb-6 rounded-3xl p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">Eventos incluidos ({current.length})</h2>
        <div className="space-y-2">
          {current.length === 0 && <p className="text-sm text-muted">Aún no agregas eventos.</p>}
          {current.map((c) => (
            <div key={c.eventId} className="flex items-center justify-between rounded-2xl border border-line bg-surface/40 px-4 py-3 text-sm">
              <div>
                <span className="font-medium">{c.eventTitle}</span>
                <span className="ml-2 text-xs text-muted">{c.ticketTypeName} · {money(c.ticketTypePriceCents, currency)}</span>
              </div>
              <button onClick={() => remove(c.eventId)} disabled={pending} className="text-muted transition hover:text-fuchsia disabled:opacity-50">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Agregar evento */}
        <div className="mt-5 border-t border-line pt-5">
          {pickable.length === 0 ? (
            <p className="text-xs text-muted">No hay más eventos publicados con boletos para agregar.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <select value={eventId} onChange={(e) => { setEventId(e.target.value); setTicketTypeId(""); }}
                className="rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm outline-none focus:border-fuchsia/60">
                <option value="">Elegir evento…</option>
                {pickable.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <select value={ticketTypeId} onChange={(e) => setTicketTypeId(e.target.value)} disabled={!chosen}
                className="rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm outline-none focus:border-fuchsia/60 disabled:opacity-50">
                <option value="">Tipo de boleto…</option>
                {chosen?.ticketTypes.map((t) => <option key={t.id} value={t.id}>{t.name} · {money(t.price_cents, currency)}</option>)}
              </select>
              <button onClick={add} disabled={pending} className="brand-gradient flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-ink disabled:opacity-50">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar
              </button>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-fuchsia">{error}</p>}
        </div>
      </div>
    </div>
  );
}
