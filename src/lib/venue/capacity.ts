/** Cálculo profesional de capacidad por tipo de distribución (ratios m²/persona estándar). */

export interface CapacityRow { key: string; label: string; people: number; ratio: number; }

// m² por persona (sobre área útil). Fuente: estándares de aforo de eventos.
const RATIOS: { key: string; label: string; ratio: number }[] = [
  { key: "concert", label: "Concierto (de pie)", ratio: 0.4 },
  { key: "max", label: "Capacidad máxima (de pie)", ratio: 0.33 },
  { key: "theater", label: "Teatro (filas)", ratio: 0.55 },
  { key: "church", label: "Iglesia", ratio: 0.5 },
  { key: "conference", label: "Conferencia", ratio: 0.9 },
  { key: "recommended", label: "Recomendada", ratio: 0.7 },
  { key: "comfortable", label: "Cómoda", ratio: 1.1 },
  { key: "dinner", label: "Cena / gala", ratio: 1.2 },
  { key: "banquet", label: "Banquete (mesas)", ratio: 1.5 },
];

/** Devuelve el aforo por tipo. `area` en m². Descuenta escenario/circulación/servicios. */
export function capacityMatrix(areaM2: number, usableFactor = 0.65): CapacityRow[] {
  const usable = Math.max(0, areaM2 * usableFactor);
  const rows = RATIOS.map((r) => ({ key: r.key, label: r.label, ratio: r.ratio, people: Math.floor(usable / r.ratio) }));
  // VIP ~ 8% de la recomendada.
  const rec = rows.find((r) => r.key === "recommended");
  rows.push({ key: "vip", label: "Capacidad VIP", ratio: 0, people: Math.floor((rec?.people ?? 0) * 0.08) });
  return rows;
}
