/**
 * Lector mínimo de .xlsx para pruebas: descomprime el ZIP (central directory +
 * inflateRaw) y extrae celdas de las hojas generadas por `lib/xlsx/writer`.
 * Valida además CRC32 y tamaños de cada entrada (archivo íntegro).
 */
import { inflateRawSync } from "node:zlib";
import { crc32 } from "@/lib/xlsx/writer";

export function unzip(buf: Buffer): Map<string, string> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("ZIP sin End Of Central Directory");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Central directory corrupto");
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`Encabezado local corrupto: ${name}`);
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const comp = buf.subarray(start, start + compSize);
    const raw = method === 8 ? inflateRawSync(comp) : comp;
    if (raw.length !== size) throw new Error(`Tamaño incorrecto: ${name}`);
    if (crc32(raw) !== crc) throw new Error(`CRC incorrecto: ${name}`);
    files.set(name, raw.toString("utf8"));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const unescape = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

export interface SheetData {
  name: string;
  xml: string;
  /** ref → valor (string para texto, number para números/fechas). */
  cells: Map<string, string | number>;
  /** Filas como arreglos densos (índice 0 = columna A). */
  rows: (string | number | null)[][];
}

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function readWorkbook(buf: Buffer): SheetData[] {
  const files = unzip(buf);
  const wb = files.get("xl/workbook.xml");
  if (!wb) throw new Error("Falta xl/workbook.xml");
  const names = [...wb.matchAll(/<sheet name="([^"]*)" sheetId="(\d+)"/g)].map((m) => unescape(m[1]));
  return names.map((name, i) => {
    const xml = files.get(`xl/worksheets/sheet${i + 1}.xml`);
    if (!xml) throw new Error(`Falta la hoja ${i + 1}`);
    const cells = new Map<string, string | number>();
    const rows: (string | number | null)[][] = [];
    for (const m of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>(.*?)<\/c>)/g)) {
      const [, col, rowStr, attrs, inner] = m;
      if (inner == null) continue;
      let v: string | number;
      if (attrs.includes('t="inlineStr"')) {
        v = unescape(/<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1] ?? "");
      } else {
        v = Number(/<v>([^<]*)<\/v>/.exec(inner)?.[1]);
      }
      cells.set(`${col}${rowStr}`, v);
      const r = Number(rowStr) - 1;
      (rows[r] ??= [])[colIndex(col)] = v;
    }
    for (let r = 0; r < rows.length; r++) {
      rows[r] = Array.from(rows[r] ?? [], (x) => (x === undefined ? null : x));
    }
    return { name, xml, cells, rows };
  });
}

/** Busca la fila de encabezados (la que contiene `firstHeader`) y devuelve los datos como objetos. */
export function tableObjects(sheet: SheetData, firstHeader: string): Record<string, string | number | null>[] {
  const hi = sheet.rows.findIndex((r) => r?.[0] === firstHeader);
  if (hi < 0) throw new Error(`Sin encabezado ${firstHeader} en ${sheet.name}`);
  const heads = sheet.rows[hi] as string[];
  const out: Record<string, string | number | null>[] = [];
  for (let r = hi + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    if (!row || row.length === 0 || typeof row[0] !== "number") break; // fin de la tabla (fila vacía / totales)
    out.push(Object.fromEntries(heads.map((h, i) => [h, row[i] ?? null])));
  }
  return out;
}

/** Fila cuyo primer texto en las columnas A–B coincide con `label` (resumen/totales). */
export function rowByLabel(sheet: SheetData, label: string | RegExp): (string | number | null)[] | undefined {
  return sheet.rows.find((r) => r && r.slice(0, 2).some((c) => typeof c === "string" && (typeof label === "string" ? c === label : label.test(c))));
}
