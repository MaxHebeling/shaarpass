"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Lock, Ticket, Users } from "lucide-react";
import { CATEGORY_LABEL, CATEGORIES, type Category, type CoverageClaim } from "@/lib/protocol/rules";
import { Badge, Button, Choice, Field, Select, TextInput } from "./ui";

interface PersonView {
  id: string; index: number; full_name: string | null; email: string | null; phone: string | null; city: string | null;
  category: Category | null; relation: string | null; is_pastor: boolean | null; coverage_claim: CoverageClaim | null;
  coverage_review: "confirmed" | "pending" | null; ticket_status: string | null; checked_in: boolean;
  editable: boolean; blockedReason: string | null;
}
interface View {
  event: { title: string; startsAt: string; timezone: string; cover: string | null; slug: string };
  settings: { companions: boolean; coverage: boolean; coverageLeader: string | null; deadline: string | null };
  accompanied: "yes" | "no" | "tbd" | null;
  people: PersonView[];
}

/** Formulario del comprador para identificar a quién usará cada boleto. */
export function AttendeesForm({ token }: { token: string }) {
  const [view, setView] = useState<View | null>(null);
  const [people, setPeople] = useState<PersonView[]>([]);
  const [accompanied, setAccompanied] = useState<View["accompanied"]>(null);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "saved" | "error" | "invalid">("loading");
  const [msg, setMsg] = useState<string | null>(null);

  function apply(v: View) {
    setView(v); setPeople(v.people); setAccompanied(v.accompanied);
  }

  useEffect(() => {
    fetch(`/api/protocol/order/${token}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) { setState("invalid"); return; }
        apply(await r.json()); setState("ready");
      })
      .catch(() => setState("error"));
  }, [token]);

  const set = (id: string, patch: Partial<PersonView>) => {
    setPeople((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    if (state === "saved") setState("ready");
  };

  async function save() {
    setState("saving"); setMsg(null);
    const body = {
      accompanied: accompanied ?? undefined,
      people: people.filter((p) => p.editable).map((p) => ({
        id: p.id, full_name: p.full_name, email: p.email, phone: p.phone, city: p.city, category: p.category,
        relation: p.relation, is_pastor: p.is_pastor, coverage_claim: p.is_pastor ? p.coverage_claim : null,
      })),
    };
    const r = await fetch(`/api/protocol/order/${token}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (data?.people) apply(data as View);
    if (!r.ok || data?.errors?.length) {
      setState("ready");
      setMsg(data?.errors?.[0]?.error ?? data?.error ?? "No se pudo guardar. Revisa los datos.");
      return;
    }
    setState("saved");
  }

  if (state === "loading") return <div className="grid min-h-[50vh] place-items-center text-muted"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (state === "invalid" || !view) {
    return (
      <div className="glass mx-auto max-w-md rounded-3xl p-8 text-center">
        <h1 className="font-display text-2xl font-bold">Enlace no disponible</h1>
        <p className="mt-2 text-sm text-muted">El enlace no es válido o el registro de asistentes no está activo para este evento. Si crees que es un error, contacta a la organización.</p>
      </div>
    );
  }

  const leader = view.settings.coverageLeader?.trim() || "la organización";
  const named = people.filter((p) => p.full_name && p.full_name.trim().length >= 2).length;
  const deadline = view.settings.deadline ? new Date(view.settings.deadline) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="glass overflow-hidden rounded-3xl">
        {view.event.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={view.event.cover} alt="" className="aspect-[21/9] w-full object-cover" />
        )}
        <div className="p-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gold"><Users className="h-4 w-4" /> Registro de asistentes</div>
          <h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">{view.event.title}</h1>
          <p className="mt-2 text-sm text-muted">
            Indica quién usará cada boleto. Tu compra y tus boletos ya están confirmados; puedes completar o cambiar estos datos después con este mismo enlace.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={named === people.length ? "ok" : "warn"}>{named} de {people.length} identificados</Badge>
            {deadline && <Badge tone="muted">Cambios hasta el {deadline.toLocaleDateString("es-MX", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: view.event.timezone })}</Badge>}
          </div>
        </div>
      </div>

      {view.settings.companions && people.length > 1 && (
        <section className="glass mt-5 rounded-3xl p-5">
          <div className="mb-3 text-sm font-medium">¿Asistirá acompañado?</div>
          <Choice name="accompanied" value={accompanied} onChange={(v) => { setAccompanied(v); if (state === "saved") setState("ready"); }}
            options={[{ value: "yes", label: "Sí" }, { value: "no", label: "No" }, { value: "tbd", label: "Por confirmar" }]} />
        </section>
      )}

      <div className="mt-5 space-y-4">
        {people.map((p) => (
          <section key={p.id} className={`glass rounded-3xl p-5 ${p.editable ? "" : "opacity-80"}`} aria-labelledby={`t-${p.id}`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 id={`t-${p.id}`} className="flex items-center gap-2 font-display text-lg font-semibold">
                <Ticket className="h-4 w-4 text-gold" /> Boleto {p.index}
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {p.checked_in && <Badge tone="ok">Ya ingresó</Badge>}
                {p.coverage_review === "confirmed" && <Badge tone="ok">Cobertura confirmada</Badge>}
                {p.coverage_review === "pending" && <Badge tone="warn">Cobertura en revisión</Badge>}
                {!p.editable && <Badge tone="muted"><Lock className="h-3 w-3" /> Bloqueado</Badge>}
              </div>
            </div>
            {p.blockedReason && <p className="mb-3 text-xs text-muted">{p.blockedReason}</p>}

            <fieldset disabled={!p.editable} className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre completo">
                <TextInput value={p.full_name ?? ""} maxLength={160} placeholder={p.index === 1 ? "Ej. Pastor Juan Pérez" : "Pendiente"}
                  onChange={(e) => set(p.id, { full_name: e.target.value })} autoComplete="name" />
              </Field>
              <Field label="Tipo de asistente">
                <Select value={p.category ?? ""} onChange={(e) => set(p.id, { category: (e.target.value || null) as Category | null })}>
                  <option value="">Selecciona…</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c === "holder" ? "Titular (quien compró)" : CATEGORY_LABEL[c]}</option>)}
                </Select>
              </Field>
              <Field label="Relación con quien compró (opcional)">
                <TextInput value={p.relation ?? ""} maxLength={120} placeholder="Ej. esposa, líder de jóvenes" onChange={(e) => set(p.id, { relation: e.target.value })} />
              </Field>
              <Field label="Ciudad (opcional)">
                <TextInput value={p.city ?? ""} maxLength={120} onChange={(e) => set(p.id, { city: e.target.value })} />
              </Field>
              <Field label="Correo (opcional)">
                <TextInput type="email" value={p.email ?? ""} maxLength={200} onChange={(e) => set(p.id, { email: e.target.value })} />
              </Field>
              <Field label="Teléfono (opcional)">
                <TextInput type="tel" value={p.phone ?? ""} maxLength={40} onChange={(e) => set(p.id, { phone: e.target.value })} />
              </Field>

              {view.settings.coverage && (
                <div className="space-y-3 sm:col-span-2">
                  <div>
                    <div className="mb-2 text-xs text-muted">¿Es pastor o pastora?</div>
                    <Choice name={`pastor-${p.id}`} value={p.is_pastor === true ? "yes" : p.is_pastor === false ? "no" : null}
                      onChange={(v) => set(p.id, { is_pastor: v === "yes", coverage_claim: v === "yes" ? p.coverage_claim : null })} disabled={!p.editable}
                      options={[{ value: "yes", label: "Sí" }, { value: "no", label: "No" }]} />
                  </div>
                  {p.is_pastor && (
                    <div>
                      <div className="mb-2 text-xs text-muted">¿Pertenece a la cobertura pastoral del pastor {leader}?</div>
                      <Choice name={`cov-${p.id}`} value={p.coverage_claim} onChange={(v) => set(p.id, { coverage_claim: v })} disabled={!p.editable}
                        options={[{ value: "yes", label: "Sí" }, { value: "no", label: "No" }, { value: "org_confirm", label: "Prefiero que lo confirme la organización" }]} />
                      <p className="mt-1.5 text-[11px] text-muted">La organización valida cada cobertura antes de confirmarla.</p>
                    </div>
                  )}
                </div>
              )}
            </fieldset>
          </section>
        ))}
      </div>

      <div className="sticky bottom-4 mt-6 flex flex-col items-center gap-2">
        {msg && <div role="alert" className="rounded-xl bg-rose-500/15 px-4 py-2 text-sm text-rose-200">{msg}</div>}
        <Button variant="primary" onClick={save} disabled={state === "saving" || !people.some((p) => p.editable)} className="px-8 py-3 text-base shadow-xl shadow-fuchsia/20">
          {state === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {state === "saved" ? "Guardado" : "Guardar asistentes"}
        </Button>
      </div>
    </div>
  );
}
