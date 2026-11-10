"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { ProtocolSettings } from "@/lib/protocol/rules";
import { useProtocolAction } from "./useAction";
import { Button, Field, TextInput } from "./ui";

type Toggles = Pick<ProtocolSettings, "enabled" | "companions_enabled" | "coverage_enabled" | "meals_enabled" | "tables_enabled" | "guests_enabled" | "lock_after_checkin">;

const TOGGLES: { key: keyof Toggles; label: string; hint: string }[] = [
  { key: "enabled", label: "Módulo activo en este evento", hint: "Si lo apagas, el registro de asistentes, el enlace del correo y este panel se ocultan; los datos se conservan." },
  { key: "companions_enabled", label: "Registro de acompañantes", hint: "Pregunta «¿Asistirá acompañado?» al comprador." },
  { key: "coverage_enabled", label: "Preguntas y validación de cobertura pastoral", hint: "¿Es pastor? / ¿Pertenece a la cobertura…?" },
  { key: "guests_enabled", label: "Invitados especiales sin compra", hint: "Solo la administración puede agregarlos." },
  { key: "meals_enabled", label: "Gestión de comidas e invitaciones", hint: "Independiente del boleto." },
  { key: "tables_enabled", label: "Asignación de mesas", hint: "Capacidad controlada; exceder requiere autorización." },
  { key: "lock_after_checkin", label: "Bloquear cambios después del check-in", hint: "Tras ingresar, solo un administrador modifica al asistente." },
];

/** Convierte un ISO a valor de <input type="datetime-local"> en hora local. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SettingsPanel({ eventId, settings }: { eventId: string; settings: ProtocolSettings | null }) {
  const { run, busy, notice } = useProtocolAction(eventId);
  const [s, setS] = useState<Toggles>({
    enabled: settings?.enabled ?? true,
    companions_enabled: settings?.companions_enabled ?? true,
    coverage_enabled: settings?.coverage_enabled ?? true,
    meals_enabled: settings?.meals_enabled ?? false,
    tables_enabled: settings?.tables_enabled ?? false,
    guests_enabled: settings?.guests_enabled ?? true,
    lock_after_checkin: settings?.lock_after_checkin ?? true,
  });
  const [leader, setLeader] = useState(settings?.coverage_leader ?? "Jorge Pompa");
  const [deadline, setDeadline] = useState(toLocalInput(settings?.edit_deadline ?? null));

  async function save() {
    if (settings?.enabled && !s.enabled && !window.confirm("¿Desactivar el módulo en este evento? Los datos se conservan.")) return;
    await run("settings.update", {
      ...s, coverage_leader: leader, edit_deadline: deadline ? new Date(deadline).toISOString() : null,
    }, "Configuración guardada");
  }

  return (
    <section className="glass rounded-3xl p-5">
      <h2 className="font-display text-lg font-semibold">Configuración del evento</h2>
      <p className="mt-1 text-sm text-muted">Cada evento se configura por separado. Nada se activa automáticamente en otros eventos.</p>
      <div className="mt-4 divide-y divide-line">
        {TOGGLES.map((t) => (
          <label key={t.key} className="flex cursor-pointer items-start justify-between gap-4 py-3">
            <span>
              <span className="block text-sm font-medium">{t.label}</span>
              <span className="block text-xs text-muted">{t.hint}</span>
            </span>
            <input type="checkbox" role="switch" aria-checked={s[t.key]} className="mt-1 h-5 w-5 accent-fuchsia-600"
              checked={s[t.key]} onChange={(e) => setS({ ...s, [t.key]: e.target.checked })} />
          </label>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Pastor de la cobertura (texto de la pregunta)">
          <TextInput value={leader} maxLength={120} onChange={(e) => setLeader(e.target.value)} />
        </Field>
        <Field label="Fecha límite para cambios del comprador" hint="Vacío = sin límite">
          <TextInput type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
      </div>
      {notice && <div role="status" className={`mt-4 rounded-2xl px-4 py-2.5 text-sm ${notice.tone === "ok" ? "bg-emerald-500/10 text-emerald-200" : "bg-rose-500/15 text-rose-200"}`}>{notice.text}</div>}
      <div className="mt-5 flex justify-end">
        <Button variant="primary" onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar configuración</Button>
      </div>
    </section>
  );
}
