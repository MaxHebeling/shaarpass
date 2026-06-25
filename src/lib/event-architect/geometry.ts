import type { ObjType, VenueObject, Venue } from "./types";

/** Color por tipo de objeto (paleta ShaarPass oscura). */
export const OBJ_COLOR: Record<ObjType, string> = {
  stage: "#d6219b", backstage: "#64748b", ledScreen: "#a855f7", techBooth: "#22d3ee", streaming: "#06b6d4",
  chairBlock: "#7c3aed", aisle: "#1f2937", roundTable: "#f59e0b", headTable: "#fbbf24", danceFloor: "#ec4899",
  registrationTable: "#10b981", merchTable: "#84cc16", bookstore: "#84cc16", coffeeBreak: "#f97316",
  vipArea: "#eab308", sponsorBooth: "#3b82f6", bathroom: "#38bdf8", entrance: "#10b981", exit: "#ef4444",
  securityPoint: "#f43f5e", medicalPoint: "#ef4444",
};

export const OBJ_LABEL: Record<ObjType, string> = {
  stage: "Escenario", backstage: "Backstage", ledScreen: "Pantalla LED", techBooth: "Cabina técnica", streaming: "Streaming",
  chairBlock: "Bloque de sillas", aisle: "Pasillo", roundTable: "Mesa redonda", headTable: "Mesa principal", danceFloor: "Pista",
  registrationTable: "Mesa de registro", merchTable: "Merch", bookstore: "Librería", coffeeBreak: "Coffee break",
  vipArea: "Área VIP", sponsorBooth: "Stand", bathroom: "Baños", entrance: "Acceso", exit: "Salida",
  securityPoint: "Seguridad", medicalPoint: "Primeros auxilios",
};

/** Tamaño por defecto (metros) por tipo. */
export const OBJ_SIZE: Record<ObjType, { w: number; h: number }> = {
  stage: { w: 8, h: 3 }, backstage: { w: 4, h: 3 }, ledScreen: { w: 0.6, h: 3 }, techBooth: { w: 2.5, h: 2 }, streaming: { w: 2, h: 2 },
  chairBlock: { w: 6, h: 4 }, aisle: { w: 1.5, h: 6 }, roundTable: { w: 1.8, h: 1.8 }, headTable: { w: 3, h: 1 }, danceFloor: { w: 5, h: 5 },
  registrationTable: { w: 2, h: 0.8 }, merchTable: { w: 2.4, h: 1 }, bookstore: { w: 3, h: 2 }, coffeeBreak: { w: 3, h: 2.5 },
  vipArea: { w: 5, h: 4 }, sponsorBooth: { w: 3, h: 3 }, bathroom: { w: 2.5, h: 2.5 }, entrance: { w: 2, h: 0.5 }, exit: { w: 1.5, h: 0.5 },
  securityPoint: { w: 1.2, h: 1.2 }, medicalPoint: { w: 2, h: 2 },
};

let counter = 0;
export function makeId(type: string) { counter += 1; return `${type}-${counter}-${Math.floor(performance?.now?.() ?? counter)}`; }

export function aabbOverlap(a: VenueObject, b: VenueObject): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Mantiene el objeto dentro del recinto. */
export function clampToVenue(o: VenueObject, v: Venue): VenueObject {
  const x = Math.max(0, Math.min(v.widthM - o.width, o.x));
  const y = Math.max(0, Math.min(v.lengthM - o.height, o.y));
  return { ...o, x, y };
}

/** Sillas que aporta un bloque (rows×cols). */
export function blockCapacity(o: VenueObject): number {
  if (o.type === "chairBlock") return (o.metadata?.rows ?? 0) * (o.metadata?.cols ?? 0);
  if (o.type === "roundTable") return o.metadata?.seats ?? 8;
  if (o.type === "headTable") return o.metadata?.seats ?? 6;
  return 0;
}

export const totalArea = (v: Venue) => v.widthM * v.lengthM;
export const objArea = (o: VenueObject) => o.width * o.height;
export const occupiedArea = (objs: VenueObject[]) => objs.reduce((s, o) => s + objArea(o), 0);

/** Encuentra un hueco libre para un objeto nuevo (búsqueda en rejilla simple). */
export function findFreeSpot(o: VenueObject, v: Venue, objs: VenueObject[]): VenueObject {
  const step = 1;
  for (let y = 0.5; y <= v.lengthM - o.height; y += step) {
    for (let x = 0.5; x <= v.widthM - o.width; x += step) {
      const cand = { ...o, x, y };
      if (!objs.some((other) => aabbOverlap(cand, other))) return cand;
    }
  }
  return clampToVenue({ ...o, x: 0.5, y: 0.5 }, v);
}

/** chairBlock con rows×cols a partir de tamaño (separaciones reales). */
export function chairBlock(x: number, y: number, cols: number, rows: number, label = "Sillas"): VenueObject {
  const seatGap = 0.55, rowGap = 0.9;
  return {
    id: makeId("chairBlock"), type: "chairBlock", label, x, y,
    width: Math.max(1, cols * seatGap), height: Math.max(1, rows * rowGap), rotation: 0,
    capacityImpact: rows * cols, metadata: { rows, cols },
  };
}
