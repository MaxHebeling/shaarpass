import type { Venue, VenueObject, ObjType } from "./types";
import { OBJ_SIZE, OBJ_LABEL, makeId, findFreeSpot, clampToVenue } from "./geometry";

function add(objs: VenueObject[], v: Venue, type: ObjType, extra?: Partial<VenueObject>): VenueObject {
  const s = OBJ_SIZE[type];
  const base: VenueObject = { id: makeId(type), type, label: OBJ_LABEL[type], x: 1, y: 1, width: extra?.width ?? s.w, height: extra?.height ?? s.h, rotation: 0, capacityImpact: 0, ...extra };
  return findFreeSpot(base, v, objs);
}

/** Aplica un comando en lenguaje natural (motor local). Devuelve objetos nuevos + mensaje. */
export function parseCommand(text: string, objects: VenueObject[], venue: Venue): { objects: VenueObject[]; message: string } {
  const t = text.toLowerCase().trim();
  const out = [...objects];
  const numIn = (re: RegExp) => { const m = t.match(re); return m ? parseInt(m[1].replace(/[,.]/g, ""), 10) : 0; };

  if (/(librer[ií]a|bookstore)/.test(t)) { out.push(add(out, venue, "bookstore")); return { objects: out, message: "Agregué una librería." }; }
  if (/merch|tienda/.test(t)) { out.push(add(out, venue, "merchTable")); return { objects: out, message: "Agregué una tienda de merch." }; }
  if (/registro/.test(t)) { const n = Math.max(1, numIn(/(\d+)\s*mesas?\s*de\s*registro/) || numIn(/(\d+)\s*registro/) || 1); for (let i = 0; i < n; i++) out.push(add(out, venue, "registrationTable")); return { objects: out, message: `Agregué ${n} mesa(s) de registro.` }; }
  if (/coffee|caf[eé]/.test(t)) { out.push(add(out, venue, "coffeeBreak")); return { objects: out, message: "Agregué un coffee break." }; }
  if (/streaming|transmisi/.test(t)) { out.push(add(out, venue, "streaming")); return { objects: out, message: "Agregué cabina de streaming." }; }
  if (/cabina|t[eé]cnic/.test(t)) { out.push(add(out, venue, "techBooth")); return { objects: out, message: "Agregué cabina técnica." }; }
  if (/backstage|camerino/.test(t)) { out.push(add(out, venue, "backstage")); return { objects: out, message: "Agregué backstage." }; }
  if (/ba[ñn]o/.test(t)) { out.push(add(out, venue, "bathroom")); return { objects: out, message: "Agregué baños." }; }
  if (/seguridad/.test(t)) { out.push(add(out, venue, "securityPoint")); return { objects: out, message: "Agregué punto de seguridad." }; }
  if (/primeros auxilios|m[eé]dic/.test(t)) { out.push(add(out, venue, "medicalPoint")); return { objects: out, message: "Agregué primeros auxilios." }; }
  if (/pantalla|led/.test(t)) { out.push(add(out, venue, "ledScreen"), add(out, venue, "ledScreen")); return { objects: out, message: "Agregué dos pantallas LED." }; }
  if (/vip/.test(t)) { const cap = numIn(/(\d[\d,.]*)/) || 100; out.push(add(out, venue, "vipArea", { capacityImpact: cap, metadata: { seats: cap }, width: 5, height: 4 })); return { objects: out, message: `Agregué zona VIP para ${cap} personas.` }; }

  // Mover escenario.
  const stage = out.find((o) => o.type === "stage");
  if (stage && /escenario/.test(t)) {
    if (/fondo|atr[aá]s/.test(t)) { const i = out.indexOf(stage); out[i] = clampToVenue({ ...stage, y: venue.lengthM - stage.height - 1 }, venue); return { objects: out, message: "Moví el escenario al fondo." }; }
    if (/frente|adelante|cerca/.test(t)) { const i = out.indexOf(stage); out[i] = clampToVenue({ ...stage, y: 1 }, venue); return { objects: out, message: "Moví el escenario al frente." }; }
  }

  // Pasillo central más ancho.
  if (/pasillo/.test(t) && /(ancho|amplio|grande)/.test(t)) {
    const aisle = out.find((o) => o.type === "aisle");
    if (aisle) { const i = out.indexOf(aisle); out[i] = clampToVenue({ ...aisle, width: aisle.width + 1 }, venue); return { objects: out, message: "Ensanché el pasillo central." }; }
  }

  // Maximizar capacidad / comodidad.
  if (/maximiza|maximizar|m[aá]s\s+sillas|m[aá]s\s+capacidad/.test(t)) {
    let changed = 0;
    for (const o of out) if (o.type === "chairBlock" && o.metadata?.rows) { o.metadata.rows = Math.round((o.metadata.rows as number) * 1.25); o.height = (o.metadata.rows as number) * 0.9; o.capacityImpact = (o.metadata.rows as number) * (o.metadata.cols as number); changed++; }
    return { objects: out.map((o) => clampToVenue(o, venue)), message: changed ? "Maximicé la capacidad agregando filas." : "No hay bloques de sillas para ampliar." };
  }
  if (/comodidad|c[oó]modo/.test(t)) {
    for (const o of out) if (o.type === "chairBlock" && o.metadata?.rows) { o.metadata.rows = Math.max(1, Math.round((o.metadata.rows as number) * 0.85)); o.height = (o.metadata.rows as number) * 0.9; o.capacityImpact = (o.metadata.rows as number) * (o.metadata.cols as number); }
    return { objects: out, message: "Reduje densidad para mejorar la comodidad." };
  }

  return { objects: out, message: "No entendí el comando. Prueba: “agrega una librería”, “zona VIP para 100”, “escenario al fondo”, “maximiza capacidad”." };
}
