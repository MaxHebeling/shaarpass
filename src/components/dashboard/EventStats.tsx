import { TrendingUp, Ticket as TicketIcon, ShoppingBag, Receipt } from "lucide-react";
import { money } from "@/lib/money";

export interface DayPoint { label: string; cents: number; }

export interface EventStatsProps {
  currency: string;
  netCents: number;
  ticketsSold: number;
  capacity: number;        // 0 = sin límite
  ordersCount: number;
  series: DayPoint[];       // ventas diarias (ventana de 14–30 días)
}

/** Resumen visual del evento (estilo Eventbrite): tarjetas + aforo + gráfica de ventas. */
export function EventStats({ currency, netCents, ticketsSold, capacity, ordersCount, series }: EventStatsProps) {
  const avgTicket = ticketsSold > 0 ? Math.round(netCents / ticketsSold) : 0;
  const pct = capacity > 0 ? Math.min(100, Math.round((ticketsSold / capacity) * 100)) : 0;
  const windowTotal = series.reduce((s, d) => s + d.cents, 0);

  return (
    <div className="glass rounded-3xl p-6">
      <h2 className="mb-5 font-display text-lg font-semibold">Resumen</h2>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={TrendingUp} label="Ventas netas" value={money(netCents, currency)} />
        <div className="rounded-2xl border border-line bg-surface/40 p-4">
          <div className="flex items-center gap-2 text-xs text-muted"><TicketIcon className="h-4 w-4 text-gold" /> Boletos vendidos</div>
          <div className="mt-2 font-display text-2xl font-bold">
            {ticketsSold.toLocaleString("es-MX")}
            {capacity > 0 && <span className="ml-1 text-sm font-medium text-muted">/ {capacity.toLocaleString("es-MX")}</span>}
          </div>
          {capacity > 0 && (
            <>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div className="brand-gradient h-full rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-muted">{pct}% del aforo</div>
            </>
          )}
        </div>
        <Stat icon={ShoppingBag} label="Órdenes pagadas" value={ordersCount.toLocaleString("es-MX")} />
        <Stat icon={Receipt} label="Ticket promedio" value={ticketsSold > 0 ? money(avgTicket, currency) : "—"} />
      </div>

      <div className="mt-5 rounded-2xl border border-line bg-surface/40 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-sm font-medium">Ventas por día</span>
          <span className="text-xs text-muted">{money(windowTotal, currency)} · últimos {series.length} días</span>
        </div>
        <SalesChart series={series} />
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof TrendingUp; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/40 p-4">
      <div className="flex items-center gap-2 text-xs text-muted"><Icon className="h-4 w-4 text-gold" /> {label}</div>
      <div className="mt-2 font-display text-2xl font-bold">{value}</div>
    </div>
  );
}

/** Gráfica de área en SVG puro (sin dependencias), responsiva vía viewBox. */
function SalesChart({ series }: { series: DayPoint[] }) {
  const W = 320, H = 90, pad = 6;
  const n = series.length;
  if (n === 0 || series.every((d) => d.cents === 0)) {
    return <div className="grid h-[90px] place-items-center text-xs text-muted">Aún no hay ventas registradas.</div>;
  }
  const max = Math.max(...series.map((d) => d.cents), 1);
  const x = (i: number) => (n <= 1 ? W / 2 : pad + (i / (n - 1)) * (W - pad * 2));
  const y = (c: number) => H - pad - (c / max) * (H - pad * 2);
  const line = series.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.cents).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-24 w-full">
      <defs>
        <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d6219b" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#d6219b" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="salesLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="50%" stopColor="#d6219b" />
          <stop offset="100%" stopColor="#f5c451" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#salesFill)" />
      <path d={line} fill="none" stroke="url(#salesLine)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
