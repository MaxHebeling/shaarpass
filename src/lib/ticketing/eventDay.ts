/** Resolución del "día en curso" de un evento para el control de acceso por día. */
export interface EventDayLite {
  id: string;
  starts_at: string;
  ends_at: string;
}

/** Puerta: se abre hasta 6 h antes del inicio del día. */
const DOOR_BUFFER_MS = 6 * 3_600_000;

/**
 * Elige el día al que aplica un escaneo:
 *  1) el día en curso (ahora dentro de [inicio−6h, fin]),
 *  2) si no, el próximo día futuro,
 *  3) si todos pasaron, el último.
 */
export function resolveCurrentDay(days: EventDayLite[], now: Date = new Date()): EventDayLite | null {
  if (!days.length) return null;
  const t = now.getTime();
  const sorted = [...days].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const ongoing = sorted.find((d) => t >= Date.parse(d.starts_at) - DOOR_BUFFER_MS && t <= Date.parse(d.ends_at));
  if (ongoing) return ongoing;
  const upcoming = sorted.find((d) => Date.parse(d.starts_at) > t);
  if (upcoming) return upcoming;
  return sorted[sorted.length - 1];
}
