"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { CATEGORY_LABEL, CONFIRMATION_LABEL, isActive, type Confirmation, type TableOccupancy } from "@/lib/protocol/rules";
import type { OrgRole } from "@/lib/protocol/access";
import type { DashboardData } from "./ProtocolDashboard";
import { useProtocolAction } from "./useAction";
import { Badge, Button, Field, Select, TextInput } from "./ui";

/** Comidas especiales: independientes del boleto (comprar ≠ derecho a comida). */
export function MealsPanel({ eventId, role, data, occupancy }: { eventId: string; role: OrgRole; data: DashboardData; occupancy: TableOccupancy[] }) {
  const canManage = role === "owner" || role === "admin";
  const { run, busy, notice } = useProtocolAction(eventId);
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [capacity, setCapacity] = useState("");
  const people = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);
  const tableOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of occupancy) for (const p of o.people) m.set(p.id, o.table.name);
    return m;
  }, [occupancy]);

  async function createSession() {
    const r = await run("meal.session.create", {
      name, starts_at: startsAt ? new Date(startsAt).toISOString() : null, capacity: capacity ? Number(capacity) : null,
    }, "Comida creada");
    if (r.ok) { setName(""); setStartsAt(""); setCapacity(""); }
  }

  return (
    <div className="space-y-5">
      {notice && <div role="status" className={`rounded-2xl px-4 py-2.5 text-sm ${notice.tone === "ok" ? "bg-emerald-500/10 text-emerald-200" : "bg-rose-500/15 text-rose-200"}`}>{notice.text}</div>}

      {canManage && (
        <section className="glass rounded-3xl p-5">
          <h2 className="font-display text-lg font-semibold">Nueva comida</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1.4fr_1fr_auto] sm:items-end">
            <Field label="Nombre"><TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Ej. Comida con pastores" /></Field>
            <Field label="Fecha y hora"><TextInput type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field>
            <Field label="Cupo (opcional)"><TextInput type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
            <Button variant="primary" onClick={createSession} disabled={busy || !name.trim()}><Plus className="h-4 w-4" /> Crear</Button>
          </div>
        </section>
      )}

      {data.sessions.length === 0 && <p className="glass rounded-3xl p-8 text-center text-sm text-muted">Aún no hay comidas. {canManage ? "Crea la primera arriba." : ""}</p>}

      {data.sessions.map((s) => {
        const inv = data.invitations.filter((i) => i.session_id === s.id);
        const confirmed = inv.filter((i) => i.status === "confirmed" && isActive(people.get(i.person_id) ?? { kind: "guest", ticket_status: null, confirmation_status: "declined" }));
        const companionsAllowed = confirmed.reduce((n, i) => n + i.companions_allowed, 0);
        return (
          <section key={s.id} className="glass rounded-3xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold">{s.name}</h3>
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                  {s.starts_at && <Badge>{new Date(s.starts_at).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}</Badge>}
                  <Badge tone="ok">{confirmed.length} confirmados</Badge>
                  <Badge tone="warn">{inv.filter((i) => i.status === "pending").length} pendientes</Badge>
                  <Badge>{inv.filter((i) => i.status === "declined").length} rechazados</Badge>
                  {companionsAllowed > 0 && <Badge tone="gold">+{companionsAllowed} acompañantes autorizados</Badge>}
                  {s.capacity && <Badge tone={confirmed.length + companionsAllowed > s.capacity ? "bad" : "muted"}>Cupo {s.capacity}</Badge>}
                </div>
              </div>
              {canManage && (
                <Button variant="danger" onClick={() => { if (window.confirm(`¿Eliminar "${s.name}" y sus invitaciones?`)) run("meal.session.delete", { id: s.id }, "Comida eliminada"); }} disabled={busy}>
                  <Trash2 className="h-4 w-4" /> Eliminar
                </Button>
              )}
            </div>

            {canManage && <Inviter sessionId={s.id} data={data} invitedIds={new Set(inv.map((i) => i.person_id))} run={run} busy={busy} />}

            {inv.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs text-muted"><tr>{["Persona", "Tipo", "Invitación", "Acomp.", "Mesa", "Brazalete", "Confirmación", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-line">
                    {inv.map((i) => {
                      const p = people.get(i.person_id);
                      return (
                        <tr key={i.id} className={p && isActive(p) ? "" : "opacity-50"}>
                          <td className="px-2 py-2">{p?.full_name ?? <span className="italic text-amber-300">Pendiente</span>}{p?.kind === "guest" && <span className="ml-1"><Badge tone="gold">Especial</Badge></span>}</td>
                          <td className="px-2 py-2 text-xs text-muted">{p?.category ? CATEGORY_LABEL[p.category] : ""}</td>
                          <td className="px-2 py-2 text-xs">{i.invitation_type ?? "—"}</td>
                          <td className="px-2 py-2">
                            {canManage ? (
                              <input type="number" min={0} max={20} defaultValue={i.companions_allowed} aria-label="Acompañantes autorizados"
                                onBlur={(e) => { const v = Number(e.target.value); if (v !== i.companions_allowed) run("meal.update", { id: i.id, companions_allowed: v }); }}
                                className="w-16 rounded-lg border border-line bg-surface/60 px-2 py-1 text-sm" />
                            ) : i.companions_allowed}
                          </td>
                          <td className="px-2 py-2 text-xs">{tableOf.get(i.person_id) ?? <span className={i.status === "confirmed" ? "text-amber-300" : "text-muted"}>Sin mesa</span>}</td>
                          <td className="px-2 py-2">
                            {canManage ? (
                              <input defaultValue={i.badge ?? ""} maxLength={60} aria-label="Brazalete"
                                onBlur={(e) => { if ((e.target.value || null) !== i.badge) run("meal.update", { id: i.id, badge: e.target.value }); }}
                                className="w-28 rounded-lg border border-line bg-surface/60 px-2 py-1 text-sm" />
                            ) : i.badge ?? ""}
                          </td>
                          <td className="px-2 py-2">
                            <Select value={i.status} disabled={busy} aria-label="Confirmación" className="!py-1.5"
                              onChange={(e) => run("meal.update", { id: i.id, status: e.target.value as Confirmation }, "Confirmación actualizada")}>
                              {(Object.keys(CONFIRMATION_LABEL) as Confirmation[]).map((c) => <option key={c} value={c}>{CONFIRMATION_LABEL[c]}</option>)}
                            </Select>
                          </td>
                          <td className="px-2 py-2 text-right">
                            {canManage && (
                              <button aria-label="Quitar invitación" className="text-muted hover:text-rose-300" onClick={() => run("meal.uninvite", { id: i.id }, "Invitación retirada")}>
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Inviter({ sessionId, data, invitedIds, run, busy }: {
  sessionId: string; data: DashboardData; invitedIds: Set<string>;
  run: (a: string, p?: Record<string, unknown>, ok?: string) => Promise<{ ok: boolean }>; busy: boolean;
}) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const candidates = useMemo(() => {
    const n = q.trim().toLowerCase();
    return data.people
      .filter((p) => isActive(p) && !invitedIds.has(p.id))
      .filter((p) => !n || [p.full_name, p.buyer_name, p.city].join(" ").toLowerCase().includes(n))
      .sort((a, b) => Number(b.coverage_status === "confirmed") - Number(a.coverage_status === "confirmed") || (a.full_name ?? "~").localeCompare(b.full_name ?? "~", "es"))
      .slice(0, 40);
  }, [data.people, invitedIds, q]);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <details className="mt-4 rounded-2xl border border-line p-3">
      <summary className="flex cursor-pointer items-center gap-2 text-sm"><UserPlus className="h-4 w-4" /> Invitar personas</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar asistente o invitado…" aria-label="Buscar para invitar" />
        <TextInput value={type} onChange={(e) => setType(e.target.value)} maxLength={60} placeholder="Tipo de invitación (ej. Pastores, Mesa de honor)" aria-label="Tipo de invitación" />
      </div>
      <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
        {candidates.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface">
            <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />
            <span>{p.full_name ?? <span className="italic text-muted">Pendiente ({p.buyer_name})</span>}</span>
            {p.coverage_status === "confirmed" && <Badge tone="ok">Cobertura</Badge>}
            {p.kind === "guest" && <Badge tone="gold">Especial</Badge>}
          </label>
        ))}
        {candidates.length === 0 && <p className="px-2 py-3 text-xs text-muted">Sin resultados.</p>}
      </div>
      <div className="mt-3 flex justify-end">
        <Button variant="primary" disabled={busy || sel.size === 0}
          onClick={async () => { const r = await run("meal.invite", { session_id: sessionId, person_ids: [...sel], invitation_type: type }, `${sel.size} invitado(s)`); if (r.ok) setSel(new Set()); }}>
          Invitar {sel.size > 0 ? `(${sel.size})` : ""}
        </Button>
      </div>
    </details>
  );
}
