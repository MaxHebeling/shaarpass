"use client";

import { Plus, Trash2, CalendarDays } from "lucide-react";
import { wallTimeToISO, isoToWallParts } from "@/lib/datetime";
import type { EventDayInput } from "@/lib/ticketing/schedule";

const field = "w-full rounded-xl border border-line bg-surface/60 px-3 py-2 text-sm outline-none transition focus:border-fuchsia/60";
const lbl = "mb-1 block text-[11px] text-muted";

export interface DayRow {
  date: string;      // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  endsNextDay: boolean;
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Convierte las filas de la UI a días en ISO (respetando la zona del evento). */
export function dayRowsToInput(rows: DayRow[], tz: string): EventDayInput[] {
  return rows.map((r) => ({
    dayDate: r.date,
    startsAt: wallTimeToISO(r.date, r.startTime, tz),
    endsAt: wallTimeToISO(r.endsNextDay ? addDays(r.date, 1) : r.date, r.endTime, tz),
  }));
}

/** Reconstruye las filas de la UI desde días en ISO (al editar). */
export function inputToDayRows(days: { dayDate: string; startsAt: string; endsAt: string }[], tz: string): DayRow[] {
  return days.map((d) => {
    const s = isoToWallParts(d.startsAt, tz);
    const e = isoToWallParts(d.endsAt, tz);
    return { date: d.dayDate || s.date, startTime: s.time, endTime: e.time, endsNextDay: e.date !== (d.dayDate || s.date) };
  });
}

export function defaultDayRows(): DayRow[] {
  const today = new Date().toISOString().slice(0, 10);
  return [{ date: today, startTime: "19:00", endTime: "22:00", endsNextDay: false }];
}

export function EventDaysEditor({ value, onChange }: { value: DayRow[]; onChange: (v: DayRow[]) => void }) {
  const set = (i: number, patch: Partial<DayRow>) =>
    onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function addDay() {
    const last = value[value.length - 1];
    const nextDate = last ? addDays(last.date, 1) : new Date().toISOString().slice(0, 10);
    onChange([...value, last ? { ...last, date: nextDate } : { date: nextDate, startTime: "19:00", endTime: "22:00", endsNextDay: false }]);
  }
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));

  return (
    <div className="space-y-3">
      {value.map((r, i) => {
        const crossesMidnight = !r.endsNextDay && r.endTime <= r.startTime;
        return (
          <div key={i} className="rounded-2xl border border-line bg-surface/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gold">
                <CalendarDays className="h-3.5 w-3.5" /> Día {i + 1}
              </span>
              {value.length > 1 && (
                <button type="button" onClick={() => remove(i)} className="text-muted transition hover:text-fuchsia" aria-label="Eliminar día">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <label className={lbl}>Fecha</label>
                <input type="date" value={r.date} onChange={(e) => set(i, { date: e.target.value })} className={field} />
              </div>
              <div>
                <label className={lbl}>Inicia</label>
                <input type="time" value={r.startTime} onChange={(e) => set(i, { startTime: e.target.value })} className={field} />
              </div>
              <div>
                <label className={lbl}>Termina</label>
                <input type="time" value={r.endTime} onChange={(e) => set(i, { endTime: e.target.value })} className={field} />
              </div>
            </div>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={r.endsNextDay} onChange={(e) => set(i, { endsNextDay: e.target.checked })}
                className="h-3.5 w-3.5 accent-fuchsia-500" />
              Termina al día siguiente
            </label>
            {crossesMidnight && (
              <p className="mt-1.5 text-[11px] text-amber-400">
                La hora de fin es anterior a la de inicio. Si el evento cruza la medianoche, marca “Termina al día siguiente”.
              </p>
            )}
          </div>
        );
      })}
      <button type="button" onClick={addDay}
        className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm text-muted transition hover:border-fuchsia/60 hover:text-fg">
        <Plus className="h-4 w-4" /> Agregar día
      </button>
    </div>
  );
}
