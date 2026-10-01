"use client";

import { useState, useTransition } from "react";
import { Loader2, Check } from "lucide-react";
import { updateEventDetails, setEventDays } from "@/app/dashboard/actions";
import { EVENT_TIMEZONES } from "@/lib/datetime";
import { CURRENCIES } from "@/lib/currencies";
import { EventDaysEditor, dayRowsToInput, inputToDayRows, type DayRow } from "@/components/dashboard/EventDaysEditor";

const field = "w-full rounded-xl border border-line bg-surface/60 px-4 py-2.5 text-sm outline-none transition focus:border-fuchsia/60";
const label = "mb-1.5 block text-xs text-muted";

export interface EventDetails {
  id: string; title: string; description: string | null; category: string | null;
  city: string | null; region: string | null; startsAt: string; endsAt: string;
  timezone: string; currency: string; isOnline: boolean; notifyOnChange: boolean;
}

export function EventDetailsEditor({ e, days }: { e: EventDetails; days: { dayDate: string; startsAt: string; endsAt: string }[] }) {
  const [f, setF] = useState({
    title: e.title, description: e.description ?? "", category: e.category ?? "",
    city: e.city ?? "", region: e.region ?? "",
    timezone: e.timezone || "America/Mexico_City", currency: e.currency,
    isOnline: e.isOnline, notifyOnChange: e.notifyOnChange,
  });
  const [dayRows, setDayRows] = useState<DayRow[]>(inputToDayRows(days, e.timezone));
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  function save() {
    setMsg(null); setErr(null);
    start(async () => {
      // 1) Horario por día (el trigger sincroniza inicio/fin del evento).
      const d = await setEventDays({ eventId: e.id, days: dayRowsToInput(dayRows, f.timezone) });
      if (d?.error) { setErr(d.error); return; }
      // 2) Resto de detalles.
      const res = await updateEventDetails({
        eventId: e.id, title: f.title, description: f.description, category: f.category,
        venueName: "", city: f.city, region: f.region,
        timezone: f.timezone, currency: f.currency,
        isOnline: f.isOnline, notifyOnChange: f.notifyOnChange,
      });
      if (res?.error) { setErr(res.error); return; }
      // El aviso puede venir del cambio de fecha/horario (días) o de ubicación/modalidad.
      const n = res?.notify ?? d?.notify;
      if (n) {
        const fields = [...new Set([...(d?.notify?.fields ?? []), ...(res?.notify?.fields ?? [])])];
        const detail = n.queued
          ? `📧 Enviando notificaciones automáticas a ${n.recipients} asistentes…`
          : n.recipients > 0
            ? `📧 Se enviaron notificaciones automáticas a ${n.sent} de ${n.recipients} asistentes.`
            : "No hay asistentes registrados todavía.";
        setMsg(`✅ Se detectaron cambios importantes (${fields.join(", ")}). ${detail}`);
      } else setMsg("✅ Guardado");
    });
  }

  return (
    <div className="glass rounded-3xl p-6">
      <h2 className="mb-4 font-display text-lg font-semibold">Detalles del evento</h2>
      <div className="space-y-4">
        <div>
          <label className={label}>Nombre *</label>
          <input value={f.title} onChange={(e) => set("title", e.target.value)} className={field} />
        </div>
        <div>
          <label className={label}>Descripción</label>
          <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={4} className={field} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label}>Categoría</label>
            <input value={f.category} onChange={(e) => set("category", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Modalidad</label>
            <select value={f.isOnline ? "online" : "presencial"} onChange={(e) => setF((p) => ({ ...p, isOnline: e.target.value === "online" }))} className={field}>
              <option value="presencial">Presencial</option>
              <option value="online">Virtual (en línea)</option>
            </select>
          </div>
          <div>
            <label className={label}>Moneda</label>
            <select value={f.currency} onChange={(e) => set("currency", e.target.value)} className={field}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code.toUpperCase()}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={label}>Horario por día</label>
          <EventDaysEditor value={dayRows} onChange={setDayRows} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className={label}>Zona horaria</label>
            <select value={f.timezone} onChange={(e) => set("timezone", e.target.value)} className={field}>
              {EVENT_TIMEZONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div><label className={label}>Ciudad</label><input value={f.city} onChange={(e) => set("city", e.target.value)} className={field} /></div>
          <div><label className={label}>Estado</label><input value={f.region} onChange={(e) => set("region", e.target.value)} className={field} /></div>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface/40 px-4 py-3 text-sm">
          <input type="checkbox" checked={f.notifyOnChange} onChange={(ev) => setF((p) => ({ ...p, notifyOnChange: ev.target.checked }))}
            className="mt-0.5 h-4 w-4 shrink-0 accent-fuchsia-500" />
          <span className="text-muted">
            Notificar automáticamente a los asistentes cuando cambien <span className="text-fg">fecha, horario, ubicación o modalidad</span> del evento.
          </span>
        </label>
        {err && <p className="text-sm text-fuchsia">{err}</p>}
        {msg && <p className="text-sm leading-relaxed text-emerald-400">{msg}</p>}
        <button onClick={save} disabled={pending}
          className="brand-gradient flex items-center gap-2 rounded-2xl px-6 py-3 font-semibold text-ink disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar cambios
        </button>
      </div>
    </div>
  );
}
