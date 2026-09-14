"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2, Check, ListChecks } from "lucide-react";
import { updateEventCustomFields } from "@/app/dashboard/actions";
import type { CustomField, CustomFieldType } from "@/lib/ticketing/customFields";

const TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Texto", tel: "Teléfono", email: "Correo", select: "Selección",
};

/** Editor de campos de registro personalizados del evento (empresa, puesto, etc.). */
export function CustomFieldsEditor({ eventId, initial }: { eventId: string; initial: CustomField[] }) {
  const [fields, setFields] = useState<CustomField[]>(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function add() {
    const key = `f_${crypto.randomUUID().slice(0, 8)}`;
    setFields((f) => [...f, { key, label: "", type: "text", required: false }]);
    setSaved(false);
  }
  function update(i: number, patch: Partial<CustomField>) {
    setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
    setSaved(false);
  }
  function remove(i: number) {
    setFields((f) => f.filter((_, idx) => idx !== i));
    setSaved(false);
  }

  async function save() {
    setBusy(true); setError(null); setSaved(false);
    // Descarta campos sin etiqueta antes de guardar.
    const clean = fields
      .filter((f) => f.label.trim())
      .map((f) => ({
        ...f, label: f.label.trim(),
        options: f.type === "select"
          ? String((f.options ?? []).join(",")).split(",").map((o) => o.trim()).filter(Boolean)
          : undefined,
      }));
    const res = await updateEventCustomFields(eventId, clean);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setFields(clean);
    setSaved(true);
  }

  return (
    <div className="glass mt-6 rounded-3xl p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl brand-gradient text-ink"><ListChecks className="h-4 w-4" /></span>
          <h2 className="font-display text-lg font-semibold">Campos de registro</h2>
        </div>
        {saved && <span className="flex items-center gap-1.5 text-xs text-emerald-300"><Check className="h-3.5 w-3.5" /> Guardado</span>}
      </div>
      <p className="mt-1 text-sm text-muted">Datos extra que pedirás al comprador en el checkout (empresa, puesto, etc.). Déjalo vacío si no necesitas ninguno.</p>

      <div className="mt-4 space-y-3">
        {fields.map((f, i) => (
          <div key={f.key} className="rounded-2xl border border-line bg-surface/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={f.label} onChange={(e) => update(i, { label: e.target.value })} maxLength={80} placeholder="Etiqueta (ej. Empresa)"
                className="min-w-[160px] flex-1 rounded-xl border border-line bg-surface/60 px-3 py-2 text-sm outline-none focus:border-fuchsia/60"
              />
              <select value={f.type} onChange={(e) => update(i, { type: e.target.value as CustomFieldType })}
                className="rounded-xl border border-line bg-surface/60 px-3 py-2 text-sm outline-none focus:border-fuchsia/60">
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" checked={f.required} onChange={(e) => update(i, { required: e.target.checked })} /> Obligatorio
              </label>
              <button type="button" onClick={() => remove(i)} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition hover:border-fuchsia/60 hover:text-fuchsia">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {f.type === "select" && (
              <input
                value={(f.options ?? []).join(", ")}
                onChange={(e) => update(i, { options: e.target.value.split(",").map((o) => o.trimStart()) })}
                placeholder="Opciones separadas por coma (ej. Director, Gerente, Analista)"
                className="mt-2 w-full rounded-xl border border-line bg-surface/60 px-3 py-2 text-sm outline-none focus:border-fuchsia/60"
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={add} className="flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm transition hover:border-white/20">
          <Plus className="h-4 w-4" /> Agregar campo
        </button>
        <button type="button" onClick={save} disabled={busy}
          className="brand-gradient flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold text-ink transition hover:scale-[1.02] disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar campos
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-fuchsia">{error}</p>}
    </div>
  );
}
