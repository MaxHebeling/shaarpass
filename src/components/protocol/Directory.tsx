"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Link2, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import {
  CATEGORIES, CATEGORY_LABEL, CONFIRMATION_LABEL, COVERAGE_LABEL, findDuplicates, isActive, isIdentified,
  type Category, type CoverageClaim, type Person, type ProtocolSettings, type TableOccupancy,
} from "@/lib/protocol/rules";
import type { OrgRole } from "@/lib/protocol/access";
import type { DashboardData } from "./ProtocolDashboard";
import { useProtocolAction } from "./useAction";
import { Badge, Button, Choice, Field, Select, TextInput } from "./ui";

const PAGE = 25;
type SortKey = "name" | "buyer" | "category" | "coverage";

export function Directory({ eventId, role, settings, data, occupancy }: {
  eventId: string; role: OrgRole; settings: ProtocolSettings; data: DashboardData; occupancy: TableOccupancy[];
}) {
  const isAdmin = role === "owner" || role === "admin";
  const { run, busy, notice } = useProtocolAction(eventId);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "ticket" | "guest">("all");
  const [cat, setCat] = useState<"" | Category>("");
  const [cov, setCov] = useState<"" | Person["coverage_status"]>("");
  const [ident, setIdent] = useState<"" | "yes" | "no">("");
  const [checkin, setCheckin] = useState<"" | "yes" | "no">("");
  const [showInactive, setShowInactive] = useState(false);
  const [onlyDup, setOnlyDup] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const tableOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of occupancy) for (const p of o.people) m.set(p.id, o.table.name);
    return m;
  }, [occupancy]);
  const mealOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of data.invitations) {
      const prev = m.get(i.person_id);
      if (!prev || i.status === "confirmed") m.set(i.person_id, CONFIRMATION_LABEL[i.status]);
    }
    return m;
  }, [data.invitations]);
  const companions = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of data.people) if (p.order_id && isActive(p)) m.set(p.order_id, (m.get(p.order_id) ?? 0) + 1);
    return m;
  }, [data.people]);
  const dupIds = useMemo(() => new Set(findDuplicates(data.people).flat()), [data.people]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = data.people.filter((p) => {
      if (!showInactive && !isActive(p)) return false;
      if (kind !== "all" && p.kind !== kind) return false;
      if (cat && p.category !== cat) return false;
      if (cov && p.coverage_status !== cov) return false;
      if (ident && (ident === "yes") !== isIdentified(p)) return false;
      if (checkin && (checkin === "yes") !== p.checked_in) return false;
      if (onlyDup && !dupIds.has(p.id)) return false;
      if (needle) {
        const hay = [p.full_name, p.buyer_name, p.buyer_email, p.email, p.city, p.relation].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const key = (p: Person) => ({
      name: p.full_name ?? "~", buyer: p.buyer_name ?? "~", category: p.category ? CATEGORY_LABEL[p.category] : "~",
      coverage: p.coverage_status,
    })[sort];
    return list.sort((a, b) => key(a).localeCompare(key(b), "es"));
  }, [data.people, q, kind, cat, cov, ident, checkin, onlyDup, showInactive, sort, dupIds]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = rows.slice(page * PAGE, page * PAGE + PAGE);
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0); };

  async function copyLink(orderId: string) {
    const r = await run("link.get", { order_id: orderId });
    if (r.ok && typeof r.url === "string") {
      setLink(r.url);
      try { await navigator.clipboard.writeText(r.url); } catch { /* el enlace queda visible */ }
    }
  }

  async function coverage(p: Person, status: "confirmed" | "not_confirmed" | "pending") {
    const label = status === "confirmed" ? "confirmar" : status === "not_confirmed" ? "marcar como NO confirmada" : "regresar a pendiente";
    if (!window.confirm(`¿Seguro que deseas ${label} la cobertura de ${p.full_name ?? "este asistente"}?`)) return;
    await run("person.coverage", { id: p.id, status }, "Cobertura actualizada");
  }

  return (
    <section className="space-y-4">
      <div className="glass rounded-3xl p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Field label="Buscar">
              <TextInput value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Nombre, comprador, correo, ciudad…" aria-label="Buscar asistentes" />
            </Field>
          </div>
          <Field label="Origen">
            <Select value={kind} onChange={(e) => reset(setKind)(e.target.value as typeof kind)}>
              <option value="all">Todos</option><option value="ticket">Con boleto</option><option value="guest">Invitados especiales</option>
            </Select>
          </Field>
          <Field label="Tipo">
            <Select value={cat} onChange={(e) => reset(setCat)(e.target.value as Category | "")}>
              <option value="">Todos</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </Select>
          </Field>
          <Field label="Cobertura">
            <Select value={cov} onChange={(e) => reset(setCov)(e.target.value as typeof cov)}>
              <option value="">Todas</option>
              {(Object.keys(COVERAGE_LABEL) as Person["coverage_status"][]).map((c) => <option key={c} value={c}>{COVERAGE_LABEL[c]}</option>)}
            </Select>
          </Field>
          <Field label="Identificado">
            <Select value={ident} onChange={(e) => reset(setIdent)(e.target.value as typeof ident)}>
              <option value="">Todos</option><option value="yes">Sí</option><option value="no">Pendiente</option>
            </Select>
          </Field>
          <Field label="Check-in">
            <Select value={checkin} onChange={(e) => reset(setCheckin)(e.target.value as typeof checkin)}>
              <option value="">Todos</option><option value="yes">Ingresó</option><option value="no">No ha ingresado</option>
            </Select>
          </Field>
          <Field label="Ordenar">
            <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="name">Nombre</option><option value="buyer">Comprador</option><option value="category">Tipo</option><option value="coverage">Cobertura</option>
            </Select>
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={showInactive} onChange={(e) => reset(setShowInactive)(e.target.checked)} /> Incluir cancelados/reembolsados</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={onlyDup} onChange={(e) => reset(setOnlyDup)(e.target.checked)} /> Solo posibles duplicados ({dupIds.size})</label>
          </div>
          {isAdmin && settings.guests_enabled && (
            <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Invitado especial</Button>
          )}
        </div>
      </div>

      {notice && <div role="status" className={`rounded-2xl px-4 py-2.5 text-sm ${notice.tone === "ok" ? "bg-emerald-500/10 text-emerald-200" : "bg-rose-500/15 text-rose-200"}`}>{notice.text}</div>}
      {link && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-2 px-4 py-2.5 text-xs">
          <Link2 className="h-4 w-4 text-gold" /> Enlace del comprador (copiado):
          <code className="min-w-0 flex-1 truncate">{link}</code>
          <button aria-label="Cerrar" onClick={() => setLink(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="glass overflow-x-auto rounded-3xl">
        {current.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">{data.people.length === 0 ? "Aún no hay asistentes. Aparecerán aquí en cuanto se vendan boletos." : "Ningún asistente coincide con los filtros."}</p>
        ) : (
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                {["Asistente", "Comprador", "Ciudad", "Tipo", "Cobertura", "Acomp.", "Boleto", ...(settings.meals_enabled ? ["Comida"] : []), ...(settings.tables_enabled ? ["Mesa"] : []), "Check-in", ""].map((h) => (
                  <th key={h} scope="col" className="px-3 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {current.map((p) => (
                <tr key={p.id} className={isActive(p) ? "" : "opacity-50"}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{p.full_name ?? <span className="italic text-amber-300">Pendiente de identificar</span>}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {p.kind === "guest" && <Badge tone="gold">Invitado especial</Badge>}
                      {p.is_pastor && <Badge>Pastor/a</Badge>}
                      {dupIds.has(p.id) && <Badge tone="warn">¿Duplicado?</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted">{p.kind === "guest" ? "—" : p.buyer_name ?? p.buyer_email}</td>
                  <td className="px-3 py-2.5 text-muted">{p.city ?? ""}</td>
                  <td className="px-3 py-2.5">{p.category ? CATEGORY_LABEL[p.category] : <span className="text-muted">—</span>}{p.relation && <div className="text-xs text-muted">{p.relation}</div>}</td>
                  <td className="px-3 py-2.5">
                    <Badge tone={p.coverage_status === "confirmed" ? "ok" : p.coverage_status === "pending" ? "warn" : p.coverage_status === "not_confirmed" ? "bad" : "muted"}>{COVERAGE_LABEL[p.coverage_status]}</Badge>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-muted">{p.order_id ? Math.max(0, (companions.get(p.order_id) ?? 1) - 1) : 0}</td>
                  <td className="px-3 py-2.5 text-xs">{p.kind === "guest" ? "—" : p.ticket_status === "checked_in" ? "Ingresó" : p.ticket_status === "valid" ? "Válido" : p.ticket_status}</td>
                  {settings.meals_enabled && <td className="px-3 py-2.5 text-xs">{mealOf.get(p.id) ?? <span className="text-muted">No invitado</span>}</td>}
                  {settings.tables_enabled && <td className="px-3 py-2.5 text-xs">{tableOf.get(p.id) ?? <span className="text-muted">—</span>}</td>}
                  <td className="px-3 py-2.5 text-xs">{p.checked_in ? <Badge tone="ok">Sí</Badge> : <span className="text-muted">No</span>}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <IconBtn label="Editar asistente" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></IconBtn>
                      {isAdmin && p.is_pastor && p.coverage_status !== "confirmed" && (
                        <IconBtn label="Confirmar cobertura" onClick={() => coverage(p, "confirmed")} disabled={busy}><ShieldCheck className="h-4 w-4" /></IconBtn>
                      )}
                      {isAdmin && p.order_id && p.kind === "ticket" && (
                        <IconBtn label="Copiar enlace del comprador" onClick={() => copyLink(p.order_id!)} disabled={busy}><Copy className="h-4 w-4" /></IconBtn>
                      )}
                      {isAdmin && p.kind === "guest" && (
                        <IconBtn label="Eliminar invitado" onClick={() => { if (window.confirm(`¿Eliminar a ${p.full_name}?`)) run("guest.delete", { id: p.id }, "Invitado eliminado"); }} disabled={busy}>
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>{rows.length} asistente(s)</span>
        <div className="flex items-center gap-2">
          <IconBtn label="Página anterior" onClick={() => setPage((n) => Math.max(0, n - 1))} disabled={page === 0}><ChevronLeft className="h-4 w-4" /></IconBtn>
          <span>Página {page + 1} de {pages}</span>
          <IconBtn label="Página siguiente" onClick={() => setPage((n) => Math.min(pages - 1, n + 1))} disabled={page >= pages - 1}><ChevronRight className="h-4 w-4" /></IconBtn>
        </div>
      </div>

      {editing && (
        <PersonEditor
          person={editing === "new" ? null : editing} isAdmin={isAdmin} settings={settings} busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            const r = editing === "new"
              ? await run("guest.create", payload, "Invitado agregado")
              : await run("person.update", { id: (editing as Person).id, ...payload }, "Asistente actualizado");
            if (r.ok) setEditing(null);
          }}
          onCoverage={editing !== "new" ? (s) => coverage(editing as Person, s) : undefined}
        />
      )}
    </section>
  );
}

function IconBtn({ label, children, ...props }: { label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} title={label} {...props}
      className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition hover:border-white/20 hover:text-fg disabled:opacity-40">
      {children}
    </button>
  );
}

function PersonEditor({ person, isAdmin, settings, busy, onClose, onSave, onCoverage }: {
  person: Person | null; isAdmin: boolean; settings: ProtocolSettings; busy: boolean;
  onClose: () => void; onSave: (p: Record<string, unknown>) => void; onCoverage?: (s: "confirmed" | "not_confirmed" | "pending") => void;
}) {
  const [f, setF] = useState({
    full_name: person?.full_name ?? "", email: person?.email ?? "", phone: person?.phone ?? "", city: person?.city ?? "",
    category: (person?.category ?? (person ? "" : "guest")) as Category | "", relation: person?.relation ?? "",
    is_pastor: person?.is_pastor ?? null as boolean | null, coverage_claim: person?.coverage_claim ?? null as CoverageClaim | null,
    confirmation_status: person?.confirmation_status ?? "confirmed", access_category: person?.access_category ?? "",
    badge: person?.badge ?? "", admin_notes: person?.admin_notes ?? "",
  });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const leader = settings.coverage_leader?.trim() || "la organización";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={person ? "Editar asistente" : "Nuevo invitado especial"}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-line bg-ink-2 p-6 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">{person ? "Editar asistente" : "Nuevo invitado especial"}</h3>
          <button aria-label="Cerrar" onClick={onClose} className="text-muted hover:text-fg"><X className="h-5 w-5" /></button>
        </div>
        {person?.checked_in && <p className="mb-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">Este asistente ya hizo check-in. {isAdmin ? "Como administrador puedes modificarlo." : "Solo un administrador puede modificarlo."}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre completo *"><TextInput autoFocus value={f.full_name} maxLength={160} onChange={(e) => set({ full_name: e.target.value })} /></Field>
          <Field label="Tipo de asistente">
            <Select value={f.category} onChange={(e) => set({ category: e.target.value as Category | "" })}>
              <option value="">—</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </Select>
          </Field>
          <Field label="Relación"><TextInput value={f.relation} maxLength={120} onChange={(e) => set({ relation: e.target.value })} /></Field>
          <Field label="Ciudad"><TextInput value={f.city} maxLength={120} onChange={(e) => set({ city: e.target.value })} /></Field>
          <Field label="Correo"><TextInput type="email" value={f.email} maxLength={200} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label="Teléfono"><TextInput value={f.phone} maxLength={40} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <div className="mb-2 text-xs text-muted">¿Es pastor o pastora?</div>
            <Choice name="ed-pastor" value={f.is_pastor === true ? "yes" : f.is_pastor === false ? "no" : null}
              onChange={(v) => set({ is_pastor: v === "yes", coverage_claim: v === "yes" ? f.coverage_claim : null })}
              options={[{ value: "yes", label: "Sí" }, { value: "no", label: "No" }]} />
          </div>
          {f.is_pastor && (
            <div className="sm:col-span-2">
              <div className="mb-2 text-xs text-muted">¿Declara pertenecer a la cobertura del pastor {leader}?</div>
              <Choice name="ed-cov" value={f.coverage_claim} onChange={(v) => set({ coverage_claim: v })}
                options={[{ value: "yes", label: "Sí" }, { value: "no", label: "No" }, { value: "org_confirm", label: "Que lo confirme la organización" }]} />
            </div>
          )}
          {person && (
            <Field label="Confirmación de asistencia">
              <Select value={f.confirmation_status} onChange={(e) => set({ confirmation_status: e.target.value as Person["confirmation_status"] })}>
                {(Object.keys(CONFIRMATION_LABEL) as Person["confirmation_status"][]).map((c) => <option key={c} value={c}>{CONFIRMATION_LABEL[c]}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Categoría de acceso" hint="Lo ve recepción al escanear"><TextInput value={f.access_category} maxLength={60} placeholder="Ej. Pastor invitado, VIP" onChange={(e) => set({ access_category: e.target.value })} /></Field>
          <Field label="Brazalete / acreditación"><TextInput value={f.badge} maxLength={60} placeholder="Ej. Dorado" onChange={(e) => set({ badge: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <Field label="Observaciones administrativas (privadas)">
              <textarea value={f.admin_notes} maxLength={1000} rows={2} onChange={(e) => set({ admin_notes: e.target.value })}
                className="w-full rounded-xl border border-line bg-surface/60 px-3.5 py-2.5 text-sm outline-none focus:border-fuchsia/60" />
            </Field>
          </div>
        </div>

        {person && isAdmin && onCoverage && person.is_pastor && (
          <div className="mt-5 rounded-2xl border border-line p-4">
            <div className="text-sm font-medium">Validación de cobertura</div>
            <p className="mt-1 text-xs text-muted">Estado actual: {COVERAGE_LABEL[person.coverage_status]}. Ser pastor no implica estar bajo cobertura.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => onCoverage("confirmed")} disabled={busy}><ShieldCheck className="h-4 w-4" /> Confirmar</Button>
              <Button onClick={() => onCoverage("not_confirmed")} disabled={busy}>No confirmada</Button>
              <Button onClick={() => onCoverage("pending")} disabled={busy}>Pendiente</Button>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={busy || (!person && f.full_name.trim().length < 2)}
            onClick={() => onSave({ ...f, category: f.category || null, ...(person ? {} : { confirmation_status: undefined }) })}>
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}
