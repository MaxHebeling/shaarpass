import type { GenerateInput, Layout, Venue, VenueObject, ObjType } from "./types";
import { OBJ_LABEL, OBJ_SIZE, makeId, chairBlock } from "./geometry";
import { computeMetrics } from "./metrics";
import { buildRecommendations } from "./recommendations";

function obj(type: ObjType, x: number, y: number, w?: number, h?: number, extra?: Partial<VenueObject>): VenueObject {
  const s = OBJ_SIZE[type];
  return { id: makeId(type), type, label: OBJ_LABEL[type], x, y, width: w ?? s.w, height: h ?? s.h, rotation: 0, capacityImpact: 0, ...extra };
}

type Category = "seated" | "banquet" | "expo";
export function categoryOf(eventType: string): Category {
  const t = eventType.toLowerCase();
  if (/(boda|cena|banquete|gala)/.test(t)) return "banquet";
  if (/(expo|feria|exhib)/.test(t)) return "expo";
  return "seated";
}

/** Motor local: interpreta un prompt en lenguaje natural a parámetros + flags. */
export function parsePrompt(text: string): Partial<GenerateInput> & { flags: Record<string, number | boolean> } {
  const t = text.toLowerCase();
  const num = (re: RegExp) => { const m = t.match(re); return m ? parseInt(m[1].replace(/[,.]/g, ""), 10) : undefined; };
  const types: [RegExp, string][] = [
    [/congreso\s+cristiano/, "Congreso cristiano"], [/congreso/, "Congreso"], [/iglesia/, "Iglesia"], [/concierto/, "Concierto"],
    [/boda/, "Boda"], [/banquete/, "Banquete"], [/cena de gala|gala/, "Cena de gala"], [/cena/, "Cena"], [/expo|feria/, "Expo"],
    [/teatro/, "Teatro"], [/graduaci/, "Graduación"], [/seminario/, "Seminario"], [/convenci/, "Convención"], [/conferencia/, "Conferencia"],
  ];
  let eventType: string | undefined; for (const [re, name] of types) if (re.test(t)) { eventType = name; break; }
  return {
    eventType,
    targetCapacity: num(/(\d[\d,.]*)\s*(personas|asistentes|invitados|sillas)/),
    flags: {
      led: /pantalla|led/.test(t), bookstore: /librer[ií]a/.test(t), coffee: /coffee|caf[eé]/.test(t),
      vip: /vip/.test(t), vipCap: num(/vip[^\d]*(\d[\d,.]*)/) ?? 0, streaming: /streaming|transmisi/.test(t),
      merch: /merch|tienda/.test(t), registrations: num(/(\d+)\s*mesas?\s*de\s*registro/) ?? 0,
      stageW: num(/escenario[^\d]*(\d+)\s*(m|metros)/) ?? 0,
    },
  };
}

export function generateLayout(input: GenerateInput): Layout {
  const venue: Venue = { widthM: Math.max(6, input.widthM), lengthM: Math.max(6, input.lengthM), heightM: input.heightM || 4, shape: "Rectangular", eventType: input.eventType };
  const W = venue.widthM, L = venue.lengthM, m = 1;
  const flags = (input.prompt ? parsePrompt(input.prompt).flags : {}) as Record<string, number | boolean>;
  const cat = categoryOf(input.eventType);
  const objs: VenueObject[] = [];
  const accesses = Math.max(1, input.accesses ?? 2), exits = Math.max(2, input.exits ?? 4);

  // Accesos y salidas (comunes).
  for (let i = 0; i < accesses; i++) objs.push(obj("entrance", W * ((i + 1) / (accesses + 1)) - 1, L - 0.5));
  const exitSpots: [number, number][] = [[0, L * 0.35], [W - 1.5, L * 0.35], [0, L * 0.7], [W - 1.5, L * 0.7], [W / 2 - 0.75, 0.2]];
  for (let i = 0; i < exits; i++) { const [x, y] = exitSpots[i % exitSpots.length]; objs.push(obj("exit", x, y)); }
  objs.push(obj("bathroom", W - 2.7, L - 3), obj("bathroom", 0.2, L - 3));
  objs.push(obj("medicalPoint", 0.2, L - 6));

  if (cat === "banquet") {
    objs.push(obj("stage", (W - 4) / 2, m, 4, 2));
    objs.push(obj("headTable", (W - 3) / 2, m + 2.5, 3, 1, { capacityImpact: 8, metadata: { seats: 8 } }));
    objs.push(obj("danceFloor", (W - 5) / 2, L * 0.35, 5, 5));
    const target = input.targetCapacity || 120; const perTable = 8; const nTables = Math.ceil(target / perTable);
    const cols = Math.max(1, Math.floor((W - 2 * m) / 3)); let placed = 0;
    for (let r = 0; placed < nTables && r < 20; r++) for (let c = 0; c < cols && placed < nTables; c++) {
      const x = m + c * 3 + 0.3, y = L * 0.5 + r * 3;
      if (y > L - 3) break;
      objs.push(obj("roundTable", x, y, 1.8, 1.8, { capacityImpact: perTable, metadata: { seats: perTable } })); placed++;
    }
  } else if (cat === "expo") {
    objs.push(obj("registrationTable", W / 2 - 3, m, 2, 0.8), obj("registrationTable", W / 2 + 1, m, 2, 0.8));
    objs.push(obj("coffeeBreak", W - 4, m));
    const cols = Math.max(2, Math.floor((W - 2 * m) / 5)), rows = Math.max(2, Math.floor((L - 6) / 5));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      objs.push(obj("sponsorBooth", m + c * 5 + 1, 3 + r * 5, 3, 3));
    }
  } else {
    // SEATED (conferencia/congreso/iglesia/teatro/concierto…)
    const stageW = Math.min(W - 2, (flags.stageW as number) > 0 ? (flags.stageW as number) : Math.max(6, W * 0.55));
    objs.push(obj("stage", (W - stageW) / 2, m, stageW, Math.min(4, Math.max(2.5, L * 0.1))));
    objs.push(obj("backstage", (W - stageW) / 2, m, 3, 2.2));
    if (flags.led) { objs.push(obj("ledScreen", (W - stageW) / 2 - 0.8, m), obj("ledScreen", (W + stageW) / 2 + 0.2, m)); }
    if (flags.streaming) objs.push(obj("streaming", W - 2.2, m + 3));
    objs.push(obj("techBooth", W / 2 - 1.25, L - 3.2));
    const regN = (flags.registrations as number) > 0 ? (flags.registrations as number) : (input.targetCapacity || 0) > 1000 ? 4 : 2;
    for (let i = 0; i < regN; i++) objs.push(obj("registrationTable", m + i * 2.3, L - 1.3, 2, 0.8));
    if (flags.bookstore || flags.merch) objs.push(obj("bookstore", W - 3.5, L - 2.5));
    if (flags.coffee) objs.push(obj("coffeeBreak", 0.3, L - 6));
    if (flags.vip) objs.push(obj("vipArea", W - 5.5, L * 0.25, 5, 4, { capacityImpact: (flags.vipCap as number) > 0 ? (flags.vipCap as number) : 100, metadata: { seats: (flags.vipCap as number) || 100 } }));

    // Sillas con pasillo central + laterales.
    const seatGap = 0.55, rowGap = 0.9, aisleW = 1.4;
    const y0 = m + Math.min(4, Math.max(2.5, L * 0.1)) + 1.5, y1 = L - 4;
    const usableW = W - 2 * m - aisleW;            // pasillo central
    const perRow = Math.max(2, Math.floor(usableW / seatGap));
    const leftCols = Math.ceil(perRow / 2), rightCols = perRow - leftCols;
    const rowsAvail = Math.max(1, Math.floor((y1 - y0) / rowGap));
    const target = input.targetCapacity || 300;
    const rows = Math.max(1, Math.min(rowsAvail, Math.ceil(target / perRow)));
    const leftX = m, centerX = m + leftCols * seatGap + aisleW;
    objs.push(chairBlock(leftX, y0, leftCols, rows, "Sillas izquierda"));
    if (rightCols > 0) objs.push(chairBlock(centerX, y0, rightCols, rows, "Sillas derecha"));
    objs.push(obj("aisle", m + leftCols * seatGap + 0.1, y0, aisleW - 0.2, rows * rowGap, { label: "Pasillo central" }));
  }

  const metrics = computeMetrics(venue, objs);
  return { venue, objects: objs, metrics, recommendations: buildRecommendations(metrics, objs) };
}
