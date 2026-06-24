/** Convierte una hora de pared (fecha+hora) en la zona del evento a UTC ISO,
 *  sin importar la zona del navegador de quien edita. */
export function wallTimeToISO(dateStr: string, timeStr: string, tz: string): string {
  const naiveUTC = Date.parse(`${dateStr}T${timeStr}:00Z`);
  const d = new Date(naiveUTC);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(d)) m[p.type] = p.value;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  const offset = asUTC - d.getTime();
  return new Date(naiveUTC - offset).toISOString();
}

/** Inverso: de un timestamp ISO (UTC) a los valores de pared (fecha + hora HH:MM)
 *  en la zona dada, para precargar inputs date/time al editar. */
export function isoToWallParts(iso: string, tz: string): { date: string; time: string } {
  const d = new Date(iso);
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(d)) m[p.type] = p.value;
  return { date: `${m.year}-${m.month}-${m.day}`, time: `${m.hour}:${m.minute}` };
}

export const EVENT_TIMEZONES: { value: string; label: string }[] = [
  { value: "America/Mexico_City", label: "México (CDMX / centro)" },
  { value: "America/Tijuana", label: "Tijuana / Baja California" },
  { value: "America/Monterrey", label: "Monterrey" },
  { value: "America/Cancun", label: "Cancún / Quintana Roo" },
  { value: "America/Argentina/Buenos_Aires", label: "Argentina" },
  { value: "America/Bogota", label: "Colombia" },
  { value: "America/Lima", label: "Perú" },
  { value: "America/Santiago", label: "Chile" },
  { value: "America/Guatemala", label: "Guatemala / Centroamérica" },
  { value: "America/Los_Angeles", label: "EE.UU. — Pacífico (San Diego)" },
  { value: "America/New_York", label: "EE.UU. — Este" },
  { value: "Europe/Madrid", label: "España" },
];
