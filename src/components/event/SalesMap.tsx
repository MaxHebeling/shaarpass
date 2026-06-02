"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { money } from "@/lib/money";
import { ourFeeCents } from "@/lib/ticketing/feeMath";

export interface SalesZone {
  id: string; name: string; color: string; points: [number, number][];
  ticketTypeId: string | null; priceCents: number; available: number; total: number;
}
interface SeatPoint { id: string; venueSeatId: string; label: string; x: number; y: number; status: string; }
interface Sel { zoneId: string; ticketTypeId: string; priceCents: number; label: string; }

export function SalesMap({
  eventId, eventSlug, currency, widthM, heightM, zones,
}: { eventId: string; eventSlug: string; currency: string; widthM: number; heightM: number; zones: SalesZone[] }) {
  const [openZone, setOpenZone] = useState<SalesZone | null>(null);
  const [seats, setSeats] = useState<SeatPoint[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [selected, setSelected] = useState<Record<string, Sel>>({});
  const [going, setGoing] = useState(false);
  const router = useRouter();
  const db = useMemo(() => createClient(), []);

  // Abre una zona: carga sus asientos + realtime.
  useEffect(() => {
    if (!openZone) return;
    let channel: ReturnType<typeof db.channel> | null = null;
    setLoadingSeats(true);
    (async () => {
      const [{ data: geo }, { data: es }] = await Promise.all([
        db.from("venue_seats_geo").select("id, label, x, y").eq("zone_id", openZone.id),
        db.from("event_seats").select("id, venue_seat_id, status").eq("event_id", eventId).eq("zone_id", openZone.id),
      ]);
      const statusByVs = new Map((es ?? []).map((r) => [r.venue_seat_id, { id: r.id, status: r.status }]));
      const merged: SeatPoint[] = (geo ?? []).map((g) => {
        const e = statusByVs.get(g.id);
        return { id: e?.id ?? g.id, venueSeatId: g.id, label: g.label, x: g.x, y: g.y, status: e?.status ?? "available" };
      });
      setSeats(merged);
      setLoadingSeats(false);

      // Realtime: cambios de estado en esta zona (handler ANTES de subscribe).
      channel = db.channel(`zone-${openZone.id}`);
      channel.on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "event_seats", filter: `zone_id=eq.${openZone.id}` },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          setSeats((cur) => cur.map((s) => (s.id === row.id ? { ...s, status: row.status } : s)));
        }
      ).subscribe();
    })();
    return () => { if (channel) db.removeChannel(channel); };
  }, [openZone, db, eventId]);

  function toggle(s: SeatPoint) {
    if (s.status !== "available" || !openZone?.ticketTypeId) return;
    setSelected((cur) => {
      const next = { ...cur };
      if (next[s.id]) delete next[s.id];
      else next[s.id] = { zoneId: openZone.id, ticketTypeId: openZone.ticketTypeId!, priceCents: openZone.priceCents, label: `${openZone.name} ${s.label}` };
      return next;
    });
  }

  const chosen = Object.entries(selected);
  const totals = useMemo(() => {
    const subtotal = chosen.reduce((s, [, v]) => s + v.priceCents, 0);
    const fee = ourFeeCents(subtotal, chosen.length);
    return { subtotal, fee, total: subtotal + fee };
  }, [chosen]);

  function checkout() {
    setGoing(true);
    const byTier = new Map<string, { ids: string[]; labels: string[]; price: number; name: string }>();
    for (const [esId, v] of chosen) {
      if (!byTier.has(v.ticketTypeId)) byTier.set(v.ticketTypeId, { ids: [], labels: [], price: v.priceCents, name: v.label.split(" ")[0] });
      const g = byTier.get(v.ticketTypeId)!; g.ids.push(esId); g.labels.push(v.label);
    }
    const items = Array.from(byTier.entries()).map(([ttId, g]) => ({
      ticketTypeId: ttId, name: g.name, price_cents: g.price, quantity: g.ids.length, eventSeatIds: g.ids, seatLabels: g.labels,
    }));
    sessionStorage.setItem(`cart:${eventSlug}`, JSON.stringify({ eventId, eventSlug, items, currency }));
    router.push(`/e/${eventSlug}/checkout`);
  }

  return (
    <div className="glass rounded-3xl p-5">
      {!openZone ? (
        <>
          <h3 className="font-display text-lg font-semibold">Elige tu zona</h3>
          <svg viewBox={`0 0 ${widthM} ${heightM}`} style={{ aspectRatio: `${widthM}/${heightM}` }} className="mt-3 w-full rounded-2xl bg-ink-2">
            <text x={widthM / 2} y={2.5} textAnchor="middle" fontSize={1.6} fill="#9a9ab0">ESCENARIO</text>
            {zones.map((z) => {
              const cx = z.points.reduce((s, p) => s + p[0], 0) / z.points.length;
              const cy = z.points.reduce((s, p) => s + p[1], 0) / z.points.length;
              const soldOut = z.available === 0;
              return (
                <g key={z.id} onClick={() => !soldOut && setOpenZone(z)} style={{ cursor: soldOut ? "not-allowed" : "pointer" }}>
                  <polygon points={z.points.map((p) => p.join(",")).join(" ")} fill={z.color} fillOpacity={soldOut ? 0.15 : 0.3} stroke={z.color} strokeWidth={0.2} />
                  <text x={cx} y={cy - 0.5} textAnchor="middle" fontSize={1.5} fill="#f4f4f7" fontWeight="bold">{z.name}</text>
                  <text x={cx} y={cy + 1.4} textAnchor="middle" fontSize={1.1} fill="#f5c451">{z.priceCents > 0 ? money(z.priceCents, currency) : "—"}</text>
                  <text x={cx} y={cy + 3} textAnchor="middle" fontSize={1} fill="#9a9ab0">{soldOut ? "Agotado" : `${z.available} disp.`}</text>
                </g>
              );
            })}
          </svg>
          <p className="mt-2 text-xs text-muted">Toca una zona para ver sus asientos.</p>
        </>
      ) : (
        <>
          <button onClick={() => setOpenZone(null)} className="mb-2 flex items-center gap-1.5 text-sm text-muted hover:text-fg">
            <ArrowLeft className="h-4 w-4" /> Zonas
          </button>
          <h3 className="font-display text-lg font-semibold" style={{ color: openZone.color }}>{openZone.name} · {money(openZone.priceCents, currency)}</h3>
          <div className="relative mt-3 max-h-[55vh] overflow-auto rounded-2xl bg-ink-2 p-2">
            {loadingSeats ? (
              <div className="grid h-40 place-items-center text-muted"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <svg viewBox={seatViewBox(seats)} className="w-full" style={{ minHeight: 200 }}>
                {seats.map((s) => {
                  const sel = !!selected[s.id]; const sold = s.status !== "available";
                  return (
                    <circle key={s.id} cx={s.x} cy={s.y} r={0.4} onClick={() => toggle(s)}
                      fill={sold ? "#3a3a4a" : sel ? "#f5c451" : openZone.color}
                      fillOpacity={sold ? 0.5 : 1} style={{ cursor: sold ? "not-allowed" : "pointer" }}>
                      <title>{openZone.name} {s.label}{sold ? " (ocupado)" : ""}</title>
                    </circle>
                  );
                })}
              </svg>
            )}
          </div>
        </>
      )}

      {chosen.length > 0 && (
        <div className="mt-4 border-t border-line pt-3 text-sm">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {chosen.map(([id, v]) => <span key={id} className="rounded-full bg-fuchsia/15 px-2 py-0.5 text-xs">{v.label}</span>)}
          </div>
          <div className="flex justify-between text-muted"><span>{chosen.length} asientos</span><span>{money(totals.subtotal, currency)}</span></div>
          <div className="flex justify-between text-muted"><span>Comisión</span><span>{money(totals.fee, currency)}</span></div>
          <div className="mt-1 flex justify-between font-display text-lg font-bold"><span>Total</span><span className="text-gold">{money(totals.total, currency)}</span></div>
          <button onClick={checkout} disabled={going} className="brand-gradient mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 font-semibold text-ink disabled:opacity-50">
            {going ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />} Continuar al pago
          </button>
        </div>
      )}
    </div>
  );
}

function seatViewBox(seats: { x: number; y: number }[]): string {
  if (!seats.length) return "0 0 10 10";
  const xs = seats.map((s) => s.x), ys = seats.map((s) => s.y);
  const minX = Math.min(...xs) - 1, minY = Math.min(...ys) - 1;
  const w = Math.max(...xs) - minX + 1, h = Math.max(...ys) - minY + 1;
  return `${minX} ${minY} ${w} ${h}`;
}
