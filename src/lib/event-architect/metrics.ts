import type { Venue, VenueObject, Metrics } from "./types";
import { blockCapacity, totalArea, occupiedArea } from "./geometry";

export function computeMetrics(venue: Venue, objects: VenueObject[]): Metrics {
  const chairs = objects.filter((o) => o.type === "chairBlock").reduce((s, o) => s + blockCapacity(o), 0);
  const tableObjs = objects.filter((o) => o.type === "roundTable" || o.type === "headTable");
  const tableSeats = tableObjs.reduce((s, o) => s + blockCapacity(o), 0);
  const vip = objects.filter((o) => o.type === "vipArea").reduce((s, o) => s + (o.capacityImpact || 0), 0);
  const capacity = chairs + tableSeats + vip;

  const areaTotal = totalArea(venue);
  const areaOccupied = Math.round(occupiedArea(objects));
  const areaFree = Math.max(0, Math.round(areaTotal - areaOccupied));
  const pctOccupied = areaTotal > 0 ? Math.round((areaOccupied / areaTotal) * 100) : 0;

  const accesses = objects.filter((o) => o.type === "entrance").length;
  const exits = objects.filter((o) => o.type === "exit").length;
  const aisles = objects.filter((o) => o.type === "aisle").length;
  const hasStage = objects.some((o) => o.type === "stage");

  // Índices heurísticos (0-100).
  const visibility = Math.max(20, Math.min(100, (hasStage ? 70 : 40) + (objects.some((o) => o.type === "ledScreen") ? 20 : 0) - Math.max(0, capacity - 800) / 80));
  const comfort = Math.max(20, Math.min(100, 100 - Math.max(0, pctOccupied - 55) * 1.4 + aisles * 4));
  const circulation = Math.max(15, Math.min(100, 40 + aisles * 10 + accesses * 8 + exits * 6 - Math.max(0, capacity - 1000) / 100));

  // Tiempos: ~25 pers/min por acceso, ~45 pers/min por salida.
  const ingressMin = accesses > 0 ? Math.ceil(capacity / (accesses * 25)) : 99;
  const evacMin = exits > 0 ? Math.max(1, Math.ceil(capacity / (exits * 45))) : 99;

  return {
    capacity, recommended: Math.round(capacity * 0.9), chairs, tables: tableObjs.length,
    areaTotal: Math.round(areaTotal), areaOccupied, areaFree, pctOccupied,
    zones: objects.length, accesses, exits,
    visibility: Math.round(visibility), comfort: Math.round(comfort), circulation: Math.round(circulation),
    ingressMin, evacMin,
  };
}
