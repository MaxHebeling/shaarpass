/** Generador geométrico de distribución de recinto (sin IA — matemática exacta). */

export interface AutoLayoutParams {
  widthM: number;        // ancho (X) en metros
  lengthM: number;       // largo (Y) en metros
  totalChairs: number;
  perRow: number;        // sillas por fila
  seatGap: number;       // separación entre sillas (m, centro a centro)
  rowGap: number;        // separación entre filas (m)
  centralAisle: boolean; // pasillo central
  lateralAisles: boolean;// pasillos laterales
}

export interface SeatBlock { name: string; color: string; points: [number, number][]; rows: number; cols: number; originX: number; originY: number; dx: number; dy: number; }
export interface AreaZone { name: string; color: string; points: [number, number][]; }
export interface LayoutSummary {
  capacity: number; placed: number; rows: number; perRow: number;
  accesses: number; exits: number; specialZones: string[];
  warnings: string[]; recommendations: string[];
}
export interface VenueLayout { widthM: number; lengthM: number; blocks: SeatBlock[]; areas: AreaZone[]; summary: LayoutSummary; }

const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

export function computeLayout(p: AutoLayoutParams): VenueLayout {
  const W = Math.max(2, p.widthM), L = Math.max(2, p.lengthM);
  const margin = 1.0, aisleW = 1.2, stageDepth = Math.min(3, Math.max(1.5, L * 0.12));
  const seatGap = Math.max(0.3, p.seatGap), rowGap = Math.max(0.5, p.rowGap);
  const perRow = Math.max(1, Math.floor(p.perRow));
  const warnings: string[] = [];

  // Columnas por bloque (pasillo central divide en dos).
  const leftCols = p.centralAisle ? Math.ceil(perRow / 2) : perRow;
  const rightCols = p.centralAisle ? perRow - leftCols : 0;

  // Ancho disponible para sillas (descontando márgenes, pasillos laterales y central).
  const sideAisle = p.lateralAisles ? aisleW : 0;
  const usableW = W - 2 * margin - 2 * sideAisle - (p.centralAisle ? aisleW : 0);
  const neededW = (perRow - 1) * seatGap;
  if (neededW > usableW) warnings.push(`${perRow} sillas por fila no caben en ${W} m de ancho; reduce sillas/fila o la separación.`);

  // Filas necesarias y cuántas caben en el largo.
  const yStart = margin + stageDepth + 1.0;             // tras el escenario
  const yBack = L - margin - 2.5;                        // zona de registro/control al fondo
  const maxRows = Math.max(1, Math.floor((yBack - yStart) / rowGap) + 1);
  const rowsNeeded = Math.ceil(p.totalChairs / perRow);
  const rows = Math.min(rowsNeeded, maxRows);
  if (rows < rowsNeeded) warnings.push(`No caben ${p.totalChairs} sillas en ${L} m de largo; caben ~${rows * perRow}. Aumenta el largo o reduce la separación entre filas.`);

  const x0 = margin + sideAisle;
  const blocks: SeatBlock[] = [];
  const blockPoly = (ox: number, cols: number): [number, number][] =>
    rect(ox - seatGap / 2, yStart - rowGap / 2, ox + (cols - 1) * seatGap + seatGap / 2, yStart + (rows - 1) * rowGap + rowGap / 2);

  if (p.centralAisle) {
    blocks.push({ name: "Sillas · Bloque izquierdo", color: "#7c3aed", rows, cols: leftCols, originX: x0, originY: yStart, dx: seatGap, dy: rowGap, points: blockPoly(x0, leftCols) });
    const rx = x0 + (leftCols - 1) * seatGap + seatGap / 2 + aisleW + seatGap / 2;
    blocks.push({ name: "Sillas · Bloque derecho", color: "#7c3aed", rows, cols: rightCols, originX: rx, originY: yStart, dx: seatGap, dy: rowGap, points: blockPoly(rx, rightCols) });
  } else {
    blocks.push({ name: "Sillas", color: "#7c3aed", rows, cols: perRow, originX: x0, originY: yStart, dx: seatGap, dy: rowGap, points: blockPoly(x0, perRow) });
  }

  const placed = blocks.reduce((s, b) => s + b.rows * b.cols, 0);

  // Áreas sugeridas (kind 'ga', el usuario las mueve/edita).
  const areas: AreaZone[] = [
    { name: "Escenario", color: "#d6219b", points: rect(margin, margin, W - margin, margin + stageDepth) },
    { name: "Mesa de registro", color: "#f5c451", points: rect(margin, L - margin - 1.8, margin + 2.5, L - margin) },
    { name: "Entrada principal", color: "#10b981", points: rect(W / 2 - 1.2, L - margin - 0.6, W / 2 + 1.2, L - margin) },
    { name: "Salida de emergencia", color: "#ef4444", points: rect(W - margin - 1.5, L - margin - 0.6, W - margin, L - margin) },
    { name: "Salida de emergencia", color: "#ef4444", points: rect(margin, margin + stageDepth, margin + 0.6, margin + stageDepth + 1.5) },
    { name: "Baños", color: "#38bdf8", points: rect(W - margin - 2.2, L - margin - 2.2, W - margin, L - margin) },
    { name: "Control de sonido / luces", color: "#a855f7", points: rect(W / 2 - 1.5, L - margin - 2, W / 2 + 1.5, L - margin - 0.8) },
    { name: "Staff", color: "#64748b", points: rect(margin, L - margin - 2.2, margin + 1.8, L - margin - 1.9) },
    { name: "VIP (sugerido)", color: "#eab308", points: rect(W - margin - 3, margin + stageDepth + 0.5, W - margin, margin + stageDepth + 2) },
  ];

  const accesses = areas.filter((a) => a.name.startsWith("Entrada")).length;
  const exits = areas.filter((a) => a.name.startsWith("Salida")).length;
  const recommendations = [
    "Mantén al menos 1.2 m de ancho en pasillos para circulación segura.",
    "Coloca señalización de salida visible en cada acceso de emergencia.",
    exits < 2 ? "Considera al menos 2 salidas de emergencia para aforos altos." : "Salidas de emergencia en lados opuestos: buen flujo de evacuación.",
    "Deja un pasillo frontal libre de ~1.5 m frente al escenario.",
    placed > 200 ? "Para aforos >200, valida la capacidad con la normativa local de tu recinto." : "Verifica la capacidad legal del recinto antes de publicar.",
  ];

  return {
    widthM: W, lengthM: L, blocks, areas,
    summary: {
      capacity: placed, placed, rows, perRow,
      accesses, exits, specialZones: ["Escenario", "Baños", "VIP", "Staff", "Registro", "Control sonido/luces"],
      warnings, recommendations,
    },
  };
}
