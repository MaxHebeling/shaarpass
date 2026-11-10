"use client";

import { useMemo } from "react";
import { AlertTriangle, BarChart3, ClipboardList, FileDown, Info, Settings2, UtensilsCrossed, Armchair } from "lucide-react";
import { DashboardTabs } from "@/components/dashboard/DashboardTabs";
import {
  computeAlerts, computeMetrics, tableOccupancy,
  type Assignment, type MealInvitation, type MealSession, type Person, type ProtocolSettings, type TableRow,
} from "@/lib/protocol/rules";
import type { OrgRole } from "@/lib/protocol/access";
import { REPORTS } from "@/lib/protocol/reports";
import { Directory } from "./Directory";
import { MealsPanel } from "./MealsPanel";
import { TablesPanel } from "./TablesPanel";
import { SettingsPanel } from "./SettingsPanel";

export interface DashboardData {
  people: Person[]; sessions: MealSession[]; invitations: MealInvitation[]; tables: TableRow[]; assignments: Assignment[];
  orders: { order_id: string; accompanied: string | null }[];
}

const ADMIN: OrgRole[] = ["owner", "admin"];

export function ProtocolDashboard({ eventId, role, settings, data }: { eventId: string; role: OrgRole; settings: ProtocolSettings; data: DashboardData }) {
  const occupancy = useMemo(() => tableOccupancy(data.tables, data.assignments, data.people), [data]);
  const metrics = useMemo(() => computeMetrics(data.people, data.invitations, occupancy), [data, occupancy]);
  const alerts = useMemo(() => computeAlerts(data.people, data.invitations, occupancy), [data, occupancy]);
  const isAdmin = ADMIN.includes(role);

  const kpis: { label: string; value: number; tone?: "ok" | "warn" | "gold"; hint?: string }[] = [
    { label: "Boletos vendidos", value: metrics.ticketsSold },
    { label: "Compras realizadas", value: metrics.orders, hint: "Una compra puede tener varios boletos" },
    { label: "Asistentes identificados", value: metrics.identified, tone: "ok" },
    { label: "Pendientes de identificar", value: metrics.pendingIdentification, tone: metrics.pendingIdentification ? "warn" : undefined },
    { label: "Pastores registrados", value: metrics.pastors },
    { label: "Cobertura confirmada", value: metrics.coverageConfirmed, tone: "gold" },
    { label: "Coberturas por validar", value: metrics.coveragePending, tone: metrics.coveragePending ? "warn" : undefined },
    { label: "Invitados especiales", value: metrics.specialGuests },
    ...(settings.meals_enabled ? [
      { label: "Confirmados a comida", value: metrics.mealConfirmed, tone: "ok" as const },
      { label: "Comida por confirmar", value: metrics.mealPending, tone: metrics.mealPending ? ("warn" as const) : undefined },
    ] : []),
    ...(settings.tables_enabled ? [
      { label: "Mesas con lugar", value: metrics.tablesWithSpace },
      { label: "Lugares asignados", value: metrics.seatsAssigned },
    ] : []),
    { label: "Check-in realizados", value: metrics.checkedIn, tone: "ok" },
  ];

  const tabs = [
    {
      id: "panel", label: "Panel", icon: <BarChart3 className="h-4 w-4" />,
      content: (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="glass rounded-2xl p-4" title={k.hint}>
                <div className={`font-display text-3xl font-bold tabular-nums ${k.tone === "ok" ? "text-emerald-300" : k.tone === "warn" ? "text-amber-300" : k.tone === "gold" ? "text-gold" : "text-fg"}`}>
                  {k.value.toLocaleString("es-MX")}
                </div>
                <div className="mt-1 text-xs text-muted">{k.label}</div>
              </div>
            ))}
          </div>
          <section className="glass rounded-3xl p-5" aria-label="Alertas operativas">
            <h2 className="font-display text-lg font-semibold">Alertas operativas</h2>
            <p className="mt-1 text-xs text-muted">Son informativas: nunca bloquean compras.</p>
            {alerts.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">Todo en orden. No hay pendientes.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {alerts.map((a) => (
                  <li key={a.code} className={`flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm ${a.level === "warn" ? "bg-amber-500/10 text-amber-100" : "bg-surface-2 text-fg"}`}>
                    {a.level === "warn" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" />}
                    {a.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ),
    },
    {
      id: "directorio", label: "Directorio", icon: <ClipboardList className="h-4 w-4" />,
      content: <Directory eventId={eventId} role={role} settings={settings} data={data} occupancy={occupancy} />,
    },
    ...(settings.meals_enabled ? [{
      id: "comidas", label: "Comidas", icon: <UtensilsCrossed className="h-4 w-4" />,
      content: <MealsPanel eventId={eventId} role={role} data={data} occupancy={occupancy} />,
    }] : []),
    ...(settings.tables_enabled ? [{
      id: "mesas", label: "Mesas", icon: <Armchair className="h-4 w-4" />,
      content: <TablesPanel eventId={eventId} role={role} data={data} occupancy={occupancy} />,
    }] : []),
    {
      id: "reportes", label: "Reportes", icon: <FileDown className="h-4 w-4" />,
      content: (
        <section className="glass rounded-3xl p-5">
          <h2 className="font-display text-lg font-semibold">Reportes</h2>
          {!isAdmin && <p className="mt-2 text-sm text-muted">Solo la administración puede exportar reportes.</p>}
          <ul className="mt-4 divide-y divide-line">
            {(Object.keys(REPORTS) as (keyof typeof REPORTS)[]).map((k) => (
              <li key={k} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="text-sm">{REPORTS[k]}</span>
                {isAdmin && (
                  <span className="flex gap-2">
                    <a href={`/api/protocol/events/${eventId}/export?report=${k}`} className="rounded-full border border-line px-3 py-1.5 text-xs transition hover:border-white/20">Excel (CSV)</a>
                    <a href={`/imprimir/protocolo/${eventId}?report=${k}`} target="_blank" className="rounded-full border border-line px-3 py-1.5 text-xs transition hover:border-white/20">Imprimir / PDF</a>
                  </span>
                )}
              </li>
            ))}
            {isAdmin && settings.tables_enabled && (
              <li className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="text-sm">Tarjetas con nombres por mesa</span>
                <a href={`/imprimir/protocolo/${eventId}?cards=1`} target="_blank" className="rounded-full border border-line px-3 py-1.5 text-xs transition hover:border-white/20">Imprimir tarjetas</a>
              </li>
            )}
          </ul>
        </section>
      ),
    },
    ...(isAdmin ? [{
      id: "config", label: "Configuración", icon: <Settings2 className="h-4 w-4" />,
      content: <SettingsPanel eventId={eventId} settings={settings} />,
    }] : []),
  ];

  return <DashboardTabs tabs={tabs} />;
}
