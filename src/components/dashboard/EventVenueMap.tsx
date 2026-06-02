"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Map, Loader2, Save } from "lucide-react";
import { attachVenueMap, setZonePrice } from "@/app/dashboard/actions";
import { money } from "@/lib/money";

export interface PublishedMap { id: string; label: string; }
export interface ZonePrice { zoneId: string; name: string; color: string; seats: number; priceCents: number; }

const field = "rounded-lg border border-line bg-surface/60 px-2.5 py-2 text-sm outline-none focus:border-fuchsia/60";

export function EventVenueMap({
  eventId, currency, maps, attached, zonePrices,
}: { eventId: string; currency: string; maps: PublishedMap[]; attached: boolean; zonePrices: ZonePrice[] }) {
  const [mapId, setMapId] = useState(maps[0]?.id ?? "");
  const [prices, setPrices] = useState<Record<string, number>>(Object.fromEntries(zonePrices.map((z) => [z.zoneId, z.priceCents / 100])));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function attach() {
    setError(null);
    start(async () => {
      const res = await attachVenueMap(eventId, mapId);
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  function savePrice(zoneId: string) {
    start(async () => {
      await setZonePrice(eventId, zoneId, Math.round((prices[zoneId] ?? 0) * 100));
      router.refresh();
    });
  }

  return (
    <div className="glass rounded-3xl p-6">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
        <Map className="h-5 w-5 text-gold" /> Mapa del recinto
      </h2>

      {!attached ? (
        <>
          <p className="mb-3 text-sm text-muted">Asocia un mapa de recinto publicado para vender con asientos numerados.</p>
          {maps.length === 0 ? (
            <p className="text-sm text-muted">No tienes mapas publicados. Crea uno en <a href="/dashboard/recintos" className="brand-text">Recintos</a>.</p>
          ) : (
            <div className="flex gap-2">
              <select value={mapId} onChange={(e) => setMapId(e.target.value)} className={`${field} flex-1`}>
                {maps.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <button onClick={attach} disabled={pending} className="brand-gradient flex items-center gap-2 rounded-lg px-4 text-sm font-semibold text-ink disabled:opacity-50">
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} Asociar
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">Precio por zona. Los compradores eligen asiento en el mapa.</p>
          <div className="space-y-2">
            {zonePrices.map((z) => (
              <div key={z.zoneId} className="flex items-center gap-3 rounded-2xl border border-line bg-surface/40 px-4 py-2.5">
                <span className="flex flex-1 items-center gap-2 text-sm">
                  <i className="h-3 w-3 rounded" style={{ background: z.color }} /> {z.name}
                  <span className="text-xs text-muted">· {z.seats} asientos</span>
                </span>
                <input type="number" min={0} step="0.01" value={prices[z.zoneId] ?? 0}
                  onChange={(e) => setPrices((p) => ({ ...p, [z.zoneId]: Number(e.target.value) }))}
                  className={`${field} w-28`} />
                <button onClick={() => savePrice(z.zoneId)} disabled={pending} className="rounded-lg border border-line px-3 py-2 text-xs transition hover:border-fuchsia/40">
                  <Save className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {error && <p className="mt-2 text-sm text-fuchsia">{error}</p>}
    </div>
  );
}
