/**
 * Horario por día de un evento (puede durar varios días).
 * Las horas llegan ya en ISO (instante absoluto), convertidas desde la zona del
 * evento en el cliente con wallTimeToISO. El inicio/fin generales del evento son
 * el PRIMER inicio y el ÚLTIMO fin (para listados, orden y filtros).
 */
export interface EventDayInput {
  dayDate: string; // "YYYY-MM-DD" (fecha de pared en la zona del evento)
  startsAt: string; // ISO
  endsAt: string; // ISO
}

export function eventBounds(days: EventDayInput[]): { startsAt: string; endsAt: string } | null {
  if (!days.length) return null;
  let start = days[0];
  let end = days[0];
  for (const d of days) {
    if (Date.parse(d.startsAt) < Date.parse(start.startsAt)) start = d;
    if (Date.parse(d.endsAt) > Date.parse(end.endsAt)) end = d;
  }
  return { startsAt: start.startsAt, endsAt: end.endsAt };
}

export function validateDays(days: EventDayInput[]): string[] {
  const errors: string[] = [];
  if (!days.length) {
    errors.push("Agrega al menos un día.");
    return errors;
  }
  const seen = new Set<string>();
  let dupe = false;
  let badRange = false;
  for (const d of days) {
    if (seen.has(d.dayDate)) dupe = true;
    seen.add(d.dayDate);
    if (!(Date.parse(d.endsAt) > Date.parse(d.startsAt))) badRange = true;
  }
  if (dupe) errors.push("No puede haber dos días con la misma fecha.");
  if (badRange) errors.push("La hora de fin debe ser posterior a la de inicio.");
  return errors;
}
