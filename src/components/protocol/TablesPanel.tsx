"use client";

import { useMemo, useState } from "react";
import { Plus, Sparkles, Trash2, X, Printer } from "lucide-react";
import { isActive, isIdentified, type Person, type TableOccupancy } from "@/lib/protocol/rules";
import type { OrgRole } from "@/lib/protocol/access";
import type { DashboardData } from "./ProtocolDashboard";
import { useProtocolAction } from "./useAction";
import { Badge, Button, Field, Select, TextInput } from "./ui";

/** Organización visual de mesas: ocupados, reservados, disponibles y pendientes. */
export function TablesPanel({ eventId, role, data, occupancy }: { eventId: string; role: OrgRole; data: DashboardData; occupancy: TableOccupancy[] }) {
  const isAdmin = role === "owner" || role === "admin";
  const { run, busy, notice } = useProtocolAction(eventId);
  const [form, setForm] = useState({ name: "", capacity: "8", reserved_seats: "0", reserved_for: "", session_id: "" });
  const [suggestions, setSuggestions] = useState<{ personId: string; tableId: string }[] | null>(null);
  const [onlyMeal, setOnlyMeal] = useState(true);

  const seated = useMemo(() => new Set(occupancy.flatMap((o) => o.people.map((p) => p.id))), [occupancy]);
  const mealConfirmed = useMemo(() => new Set(data.invitations.filter((i) => i.status === "confirmed").map((i) => i.person_id)), [data.invitations]);
  const unseated = useMemo(
    () => data.people.filter((p) => isActive(p) && !seated.has(p.id) && (!onlyMeal || !data.invitations.length || mealConfirmed.has(p.id)))
      .sort((a, b) => (a.full_name ?? "~").localeCompare(b.full_name ?? "~", "es")),
    [data.people, data.invitations.length, seated, onlyMeal, mealConfirmed],
  );
  const byId = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);
  const tableName = useMemo(() => new Map(data.tables.map((t) => [t.id, t.name])), [data.tables]);

  async function createTable() {
    const r = await run("table.save", {
      name: form.name, capacity: Number(form.capacity), reserved_seats: Number(form.reserved_seats || 0),
      reserved_for: form.reserved_for, session_id: form.session_id || null, sort: data.tables.length,
    }, "Mesa creada");
    if (r.ok) setForm((f) => ({ ...f, name: "", reserved_seats: "0", reserved_for: "" }));
  }

  async function assign(tableId: string, personId: string) {
    const r = await run("table.assign", { table_id: tableId, person_id: personId }, "Asignado");
    if (!r.ok && r.code === "capacity" && isAdmin && window.confirm("La mesa está llena. ¿Autorizas exceder su capacidad?")) {
      await run("table.assign", { table_id: tableId, person_id: personId, allow_over: true }, "Asignado (capacidad excedida, autorizado)");
    }
  }

  async function suggest() {
    const r = await run("table.suggest");
    if (r.ok) setSuggestions((r.suggestions as { personId: string; tableId: string }[]) ?? []);
  }

  return (
    <div className="space-y-5">
      {notice && <div role="status" className={`rounded-2xl px-4 py-2.5 text-sm ${notice.tone === "ok" ? "bg-emerald-500/10 text-emerald-200" : "bg-rose-500/15 text-rose-200"}`}>{notice.text}</div>}

      <section className="glass rounded-3xl p-5">
        <h2 className="font-display text-lg font-semibold">Nueva mesa</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1.4fr_0.7fr_0.7fr_1.4fr_1.2fr_auto] sm:items-end">
          <Field label="Nombre"><TextInput value={form.name} maxLength={80} placeholder="Mesa 01 — Pastores invitados" onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Capacidad"><TextInput type="number" min={1} max={200} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Field>
          <Field label="Reservados"><TextInput type="number" min={0} max={200} value={form.reserved_seats} onChange={(e) => setForm({ ...form, reserved_seats: e.target.value })} /></Field>
          <Field label="Reservada para"><TextInput value={form.reserved_for} maxLength={120} placeholder="Ej. invitados especiales" onChange={(e) => setForm({ ...form, reserved_for: e.target.value })} /></Field>
          <Field label="Comida">
            <Select value={form.session_id} onChange={(e) => setForm({ ...form, session_id: e.target.value })}>
              <option value="">General</option>
              {data.sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Button variant="primary" onClick={createTable} disabled={busy || !form.name.trim() || Number(form.capacity) < 1}><Plus className="h-4 w-4" /> Crear</Button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={onlyMeal} onChange={(e) => setOnlyMeal(e.target.checked)} /> Por sentar: solo confirmados a comida
        </label>
        <div className="flex gap-2">
          <Button onClick={suggest} disabled={busy || !occupancy.length}><Sparkles className="h-4 w-4" /> Sugerir acomodo</Button>
          {isAdmin && <a href={`/imprimir/protocolo/${eventId}?cards=1`} target="_blank" className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm transition hover:border-white/20"><Printer className="h-4 w-4" /> Tarjetas</a>}
        </div>
      </div>

      {suggestions && (
        <section className="rounded-3xl border border-gold/40 bg-gold/5 p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Sugerencia (no se aplica hasta que la confirmes)</h3>
            <button aria-label="Descartar sugerencia" onClick={() => setSuggestions(null)}><X className="h-4 w-4" /></button>
          </div>
          {suggestions.length === 0 ? <p className="mt-2 text-sm text-muted">No hay lugares suficientes o no hay personas por sentar.</p> : (
            <>
              <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                {suggestions.map((s) => <li key={s.personId}>{byId.get(s.personId)?.full_name ?? "Pendiente"} → <span className="text-gold">{tableName.get(s.tableId)}</span></li>)}
              </ul>
              <div className="mt-4 flex justify-end">
                <Button variant="primary" disabled={busy} onClick={async () => {
                  const r = await run("table.applySuggestions", { pairs: suggestions.map((s) => ({ person_id: s.personId, table_id: s.tableId })) }, "Acomodo aplicado");
                  if (r.ok) setSuggestions(null);
                }}>Aplicar {suggestions.length} asignaciones</Button>
              </div>
            </>
          )}
        </section>
      )}

      {occupancy.length === 0 && <p className="glass rounded-3xl p-8 text-center text-sm text-muted">Aún no hay mesas. Crea la primera arriba.</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {occupancy.map((o) => (
          <section key={o.table.id} className={`glass rounded-3xl p-5 ${o.over ? "ring-1 ring-rose-500/60" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-lg font-semibold">{o.table.name}</h3>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge>Capacidad {o.table.capacity}</Badge>
                  <Badge tone="ok">{o.assigned} ocupados</Badge>
                  {o.reserved > 0 && <Badge tone="gold">{o.reserved} reservados{o.table.reserved_for ? ` · ${o.table.reserved_for}` : ""}</Badge>}
                  <Badge tone={o.free ? "muted" : "warn"}>{o.free} disponibles</Badge>
                  {o.pending > 0 && <Badge tone="warn">{o.pending} por confirmar</Badge>}
                  {o.over && <Badge tone="bad">Excede capacidad</Badge>}
                </div>
              </div>
              <button aria-label={`Eliminar ${o.table.name}`} className="text-muted hover:text-rose-300" disabled={busy}
                onClick={() => { if (window.confirm(`¿Eliminar ${o.table.name}? Las personas quedarán sin mesa.`)) run("table.delete", { id: o.table.id }, "Mesa eliminada"); }}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {/* Mapa de lugares */}
            <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-5" aria-label={`Lugares de ${o.table.name}`}>
              {o.people.map((p) => <Seat key={p.id} person={p} onRemove={() => run("table.unassign", { person_id: p.id }, "Lugar liberado")} />)}
              {Array.from({ length: o.reserved }).map((_, i) => <div key={`r${i}`} className="grid min-h-14 place-items-center rounded-xl border border-gold/40 bg-gold/5 p-1 text-center text-[11px] text-gold">Reservado</div>)}
              {Array.from({ length: o.free }).map((_, i) => <div key={`f${i}`} className="grid min-h-14 place-items-center rounded-xl border border-dashed border-line p-1 text-[11px] text-muted">Libre</div>)}
            </div>

            <div className="mt-4">
              <Select value="" disabled={busy || unseated.length === 0} aria-label={`Asignar persona a ${o.table.name}`}
                onChange={(e) => { if (e.target.value) assign(o.table.id, e.target.value); }}>
                <option value="">{unseated.length ? "+ Asignar persona…" : "No hay personas por sentar"}</option>
                {unseated.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? `Pendiente (${p.buyer_name ?? "sin nombre"})`}{p.coverage_status === "confirmed" ? " · cobertura" : ""}</option>)}
              </Select>
              <MoveSelect occupancy={occupancy} current={o.table.id} people={o.people} onMove={(pid, tid) => assign(tid, pid)} disabled={busy} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Seat({ person, onRemove }: { person: Person; onRemove: () => void }) {
  const pending = !isIdentified(person) || person.confirmation_status === "pending";
  const tone = !isActive(person) ? "border-rose-500/50 bg-rose-500/10" : person.coverage_status === "confirmed" ? "border-emerald-500/40 bg-emerald-500/10" : pending ? "border-amber-500/40 bg-amber-500/5" : "border-line bg-surface";
  return (
    <div className={`group relative min-h-14 rounded-xl border p-1.5 text-[11px] leading-tight ${tone}`} title={person.full_name ?? "Pendiente"}>
      <div className="line-clamp-2 font-medium">{person.full_name ?? <span className="italic">Acompañante pendiente</span>}</div>
      {person.is_pastor && <div className="mt-0.5 text-[10px] text-muted">Pastor/a</div>}
      <button aria-label={`Quitar a ${person.full_name ?? "esta persona"}`} onClick={onRemove}
        className="absolute right-0.5 top-0.5 hidden rounded bg-ink/80 p-0.5 text-muted hover:text-rose-300 group-hover:block focus:block">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function MoveSelect({ occupancy, current, people, onMove, disabled }: {
  occupancy: TableOccupancy[]; current: string; people: Person[]; onMove: (personId: string, tableId: string) => void; disabled: boolean;
}) {
  const [pid, setPid] = useState("");
  if (!people.length || occupancy.length < 2) return null;
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <Select value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Persona a mover" disabled={disabled}>
        <option value="">Mover a…</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? "Pendiente"}</option>)}
      </Select>
      <Select value="" disabled={disabled || !pid} aria-label="Mesa destino" onChange={(e) => { if (e.target.value) { onMove(pid, e.target.value); setPid(""); } }}>
        <option value="">Mesa destino…</option>
        {occupancy.filter((o) => o.table.id !== current).map((o) => <option key={o.table.id} value={o.table.id}>{o.table.name} ({o.free} libres)</option>)}
      </Select>
    </div>
  );
}
