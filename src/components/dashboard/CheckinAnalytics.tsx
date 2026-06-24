import { Users, LogIn, Gauge, DoorOpen, Ticket as TicketIcon, Clock, Radio } from "lucide-react";

export interface Bucket { label: string; count: number; }
export interface StaffActivity { name: string; gate: string | null; scans: number; lastActive: string | null; revoked: boolean; }
export interface RecentScan { name: string; type: string; gate: string | null; at: string; }

export interface CheckinAnalyticsProps {
  registered: number;
  checkedIn: number;
  capacity: number;
  byHour: Bucket[];
  byGate: Bucket[];
  byType: Bucket[];
  staff: StaffActivity[];
  recent: RecentScan[];
}

export function CheckinAnalytics({ registered, checkedIn, capacity, byHour, byGate, byType, staff, recent }: CheckinAnalyticsProps) {
  const pending = Math.max(0, registered - checkedIn);
  const occupancy = capacity > 0 ? Math.min(100, Math.round((checkedIn / capacity) * 100)) : 0;
  const remaining = capacity > 0 ? Math.max(0, capacity - checkedIn) : null;
  const ACTIVE_MS = 10 * 60 * 1000;
  const now = Date.now();
  const activeStaff = staff.filter((s) => !s.revoked && s.lastActive && now - new Date(s.lastActive).getTime() < ACTIVE_MS).length;

  return (
    <div className="glass rounded-3xl p-6">
      <div className="mb-1 flex items-center gap-2">
        <Radio className="h-4 w-4 text-fuchsia" />
        <h2 className="font-display text-lg font-semibold">Control de Acceso</h2>
      </div>
      <p className="mb-5 text-sm text-muted">Ingresos en vivo, por puerta y por tipo de boleto.</p>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={LogIn} label="Ingresados" value={checkedIn.toLocaleString("es-MX")} tone="ok" />
        <Stat icon={Users} label="Pendientes" value={pending.toLocaleString("es-MX")} tone="gold" />
        <div className="rounded-2xl border border-line bg-surface/40 p-4">
          <div className="flex items-center gap-2 text-xs text-muted"><Gauge className="h-4 w-4 text-gold" /> Ocupación</div>
          <div className="mt-2 font-display text-2xl font-bold">{capacity > 0 ? `${occupancy}%` : "—"}</div>
          {capacity > 0 && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="brand-gradient h-full rounded-full" style={{ width: `${occupancy}%` }} />
            </div>
          )}
        </div>
        <Stat icon={Radio} label="Escáneres activos" value={String(activeStaff)} tone={activeStaff > 0 ? "ok" : "muted"} sub={remaining != null ? `${remaining.toLocaleString("es-MX")} cupos libres` : undefined} />
      </div>

      {/* Ingresos por hora */}
      <div className="mt-5 rounded-2xl border border-line bg-surface/40 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Clock className="h-4 w-4 text-gold" /> Ingresos por hora</div>
        <HourBars data={byHour} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <BarList title="Por puerta" icon={DoorOpen} data={byGate} empty="Sin ingresos aún" />
        <BarList title="Por tipo de boleto" icon={TicketIcon} data={byType} empty="Sin ingresos aún" />
      </div>

      {/* Personal */}
      <div className="mt-3 rounded-2xl border border-line bg-surface/40 p-4">
        <div className="mb-3 text-sm font-medium">Personal de recepción</div>
        {staff.length === 0 ? <p className="text-sm text-muted">Sin escáneres asignados.</p> : (
          <div className="space-y-2">
            {staff.map((s, i) => {
              const active = !s.revoked && s.lastActive && now - new Date(s.lastActive).getTime() < ACTIVE_MS;
              return (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${active ? "bg-emerald-400" : s.revoked ? "bg-rose-500" : "bg-surface-2"}`} />
                    {s.name}{s.gate && <span className="text-xs text-muted">· {s.gate}</span>}
                  </span>
                  <span className="text-xs text-muted">{s.scans} escaneos{s.lastActive ? ` · ${new Date(s.lastActive).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Últimos accesos */}
      {recent.length > 0 && (
        <div className="mt-3 rounded-2xl border border-line bg-surface/40 p-4">
          <div className="mb-3 text-sm font-medium">Últimos accesos</div>
          <div className="space-y-1.5">
            {recent.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="min-w-0 truncate">{r.name} <span className="text-xs text-muted">· {r.type}</span></span>
                <span className="shrink-0 text-xs text-muted">{r.gate ? `${r.gate} · ` : ""}{new Date(r.at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone, sub }: { icon: typeof Users; label: string; value: string; tone: "ok" | "gold" | "muted"; sub?: string }) {
  const color = tone === "ok" ? "text-emerald-400" : tone === "gold" ? "text-gold" : "text-fg";
  return (
    <div className="rounded-2xl border border-line bg-surface/40 p-4">
      <div className="flex items-center gap-2 text-xs text-muted"><Icon className="h-4 w-4 text-gold" /> {label}</div>
      <div className={`mt-2 font-display text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function HourBars({ data }: { data: Bucket[] }) {
  if (data.length === 0) return <div className="grid h-20 place-items-center text-xs text-muted">Aún no hay ingresos.</div>;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height: 88 }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[10px] tabular-nums text-muted">{d.count}</span>
          <div className="brand-gradient w-full rounded-t" style={{ height: `${Math.max(4, (d.count / max) * 64)}px` }} title={`${d.label}: ${d.count}`} />
          <span className="text-[9px] text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function BarList({ title, icon: Icon, data, empty }: { title: string; icon: typeof DoorOpen; data: Bucket[]; empty: string }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="rounded-2xl border border-line bg-surface/40 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 text-gold" /> {title}</div>
      {data.length === 0 ? <p className="text-sm text-muted">{empty}</p> : (
        <div className="space-y-2">
          {data.map((d, i) => (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between text-xs"><span className="truncate">{d.label}</span><span className="tabular-nums text-muted">{d.count}</span></div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"><div className="brand-gradient h-full rounded-full" style={{ width: `${(d.count / max) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
