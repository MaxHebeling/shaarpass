/**
 * Generador mínimo de archivos Excel (.xlsx / SpreadsheetML) sin dependencias.
 *
 * Por qué propio: el proyecto no tiene librería de Excel y solo necesitamos
 * escribir (no leer) hojas con texto, números, fechas, estilos fijos, filtros,
 * fila congelada y configuración de impresión. Un .xlsx es un ZIP de XML; aquí
 * se arma con `node:zlib` (deflate) y un CRC32 propio.
 *
 * Alcance deliberadamente pequeño: celdas de texto (inlineStr), números y
 * fechas; un juego cerrado de estilos (`CellStyle`). Sin fórmulas: todos los
 * totales se calculan en el servidor sobre los registros reales, así el archivo
 * no depende de que el programa que lo abra recalcule.
 */
import { deflateRawSync } from "node:zlib";

export type CellValue = string | number | Date | null | undefined;

/** Estilos disponibles (índices fijos en styles.xml, ver `STYLE_INDEX`). */
export type CellStyle =
  | "default"
  | "header"      // encabezado de tabla: negritas, fondo oscuro, texto blanco
  | "money"       // número con formato de moneda
  | "moneyTotal"  // moneda, negritas, fondo resaltado
  | "date"        // fecha y hora
  | "int"         // entero con separador de miles
  | "intTotal"    // entero, negritas, fondo resaltado
  | "bold"
  | "title"       // título de hoja (grande)
  | "muted"       // nota gris en cursiva
  | "wrap"        // texto que se ajusta en varias líneas
  | "label"       // etiqueta de total: negritas + fondo resaltado
  | "box"         // celda con borde (lista impresa)
  | "boxInt"      // entero centrado con borde (lista impresa)
  | "boxCheck";   // casilla de verificación centrada con borde

export interface Cell {
  v: CellValue;
  s?: CellStyle;
}

export interface SheetSpec {
  /** Nombre visible de la pestaña (se sanea a ≤31 caracteres válidos). */
  name: string;
  /** Ancho de cada columna en caracteres. */
  columns: number[];
  /** Filas; cada celda puede ser un valor suelto (estilo por defecto) o `Cell`. */
  rows: (Cell | CellValue)[][];
  /** Congela las primeras N filas (encabezados visibles al desplazar). */
  freezeRows?: number;
  /** Fila (1-based) del encabezado de la tabla con filtro automático. Abarca hasta `autoFilterLastRow`. */
  autoFilterRow?: number;
  /** Última fila (1-based) incluida en el filtro; por defecto la última fila de la hoja. */
  autoFilterLastRow?: number;
  print?: {
    landscape?: boolean;
    /** Ajusta todas las columnas al ancho de una página (sin columnas cortadas). */
    fitToWidth?: boolean;
    /** Fila (1-based) que se repite arriba de cada página impresa. */
    repeatHeaderRow?: number;
    /** Texto del pie de página izquierdo. */
    footer?: string;
  };
}

export interface WorkbookSpec {
  sheets: SheetSpec[];
  /** Código de formato numérico para moneda, p. ej. `"$"#,##0.00`. */
  moneyFormat?: string;
  title?: string;
}

const STYLE_INDEX: Record<CellStyle, number> = {
  default: 0, header: 1, money: 2, moneyTotal: 3, date: 4, int: 5, intTotal: 6,
  bold: 7, title: 8, muted: 9, wrap: 10, label: 11, box: 12, boxInt: 13, boxCheck: 14,
};

/** Formato de moneda de Excel para una divisa ISO 4217. */
export function moneyFormatFor(currency: string): string {
  const c = (currency || "").toUpperCase();
  const dollarLike = ["MXN", "USD", "CAD", "AUD", "COP", "CLP", "ARS", "UYU", "NZD", "HKD", "SGD"];
  if (dollarLike.includes(c)) return `"$"#,##0.00;-"$"#,##0.00`;
  if (c === "EUR") return `#,##0.00 "€";-#,##0.00 "€"`;
  return `#,##0.00 "${c}";-#,##0.00 "${c}"`;
}

// ───────────────────────── XML helpers ─────────────────────────

/** Escapa texto para XML y elimina caracteres de control no permitidos. */
export function xmlEscape(s: string): string {
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Índice de columna 0-based → letras de Excel (0 → A, 26 → AA). */
export function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Nombre de hoja válido para Excel: sin []:*?/\ y ≤31 caracteres. */
export function safeSheetName(name: string): string {
  const clean = name.replace(/[[\]:*?/\\]/g, " ").trim() || "Hoja";
  return clean.slice(0, 31);
}

/** Fecha → número de serie de Excel. Usa los campos UTC de la fecha (hora de pared ya resuelta). */
export function excelSerial(d: Date): number {
  return d.getTime() / 86_400_000 + 25_569;
}

function quoteSheet(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

function cellXml(ref: string, raw: Cell | CellValue): string {
  const cell: Cell = raw !== null && typeof raw === "object" && !(raw instanceof Date) ? (raw as Cell) : { v: raw as CellValue };
  const s = STYLE_INDEX[cell.s ?? "default"];
  const sAttr = s ? ` s="${s}"` : "";
  const v = cell.v;
  if (v == null || v === "") {
    return s ? `<c r="${ref}"${sAttr}/>` : "";
  }
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return s ? `<c r="${ref}"${sAttr}/>` : "";
    const ds = cell.s ? sAttr : ` s="${STYLE_INDEX.date}"`;
    return `<c r="${ref}"${ds}><v>${excelSerial(v)}</v></c>`;
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return s ? `<c r="${ref}"${sAttr}/>` : "";
    return `<c r="${ref}"${sAttr}><v>${v}</v></c>`;
  }
  // Texto como inlineStr: nunca se interpreta como fórmula (evita inyección CSV/fórmulas).
  return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(v))}</t></is></c>`;
}

function sheetXml(sheet: SheetSpec): string {
  const rowCount = sheet.rows.length;
  const colCount = Math.max(sheet.columns.length, ...sheet.rows.map((r) => r.length), 1);
  const lastRef = `${colLetter(colCount - 1)}${Math.max(rowCount, 1)}`;

  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`);
  parts.push(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`);
  if (sheet.print?.fitToWidth) parts.push(`<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>`);
  parts.push(`<dimension ref="A1:${lastRef}"/>`);
  if (sheet.freezeRows && sheet.freezeRows > 0) {
    const n = sheet.freezeRows;
    parts.push(`<sheetViews><sheetView workbookViewId="0"><pane ySplit="${n}" topLeftCell="A${n + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${n + 1}" sqref="A${n + 1}"/></sheetView></sheetViews>`);
  } else {
    parts.push(`<sheetViews><sheetView workbookViewId="0"/></sheetViews>`);
  }
  parts.push(`<sheetFormatPr defaultRowHeight="15"/>`);
  if (sheet.columns.length) {
    parts.push("<cols>");
    sheet.columns.forEach((w, i) => parts.push(`<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`));
    parts.push("</cols>");
  }
  parts.push("<sheetData>");
  sheet.rows.forEach((row, r) => {
    const cells = row.map((c, ci) => cellXml(`${colLetter(ci)}${r + 1}`, c)).join("");
    parts.push(`<row r="${r + 1}">${cells}</row>`);
  });
  parts.push("</sheetData>");
  if (sheet.autoFilterRow) {
    const last = sheet.autoFilterLastRow ?? rowCount;
    parts.push(`<autoFilter ref="A${sheet.autoFilterRow}:${colLetter(colCount - 1)}${Math.max(last, sheet.autoFilterRow)}"/>`);
  }
  parts.push(`<printOptions horizontalCentered="1"/>`);
  parts.push(`<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/>`);
  const orient = sheet.print?.landscape ? "landscape" : "portrait";
  const fit = sheet.print?.fitToWidth ? ` fitToWidth="1" fitToHeight="0"` : "";
  parts.push(`<pageSetup paperSize="1" orientation="${orient}"${fit}/>`);
  const footerLeft = sheet.print?.footer ? `&amp;L${xmlEscape(sheet.print.footer.replace(/&/g, "&&"))}` : "";
  parts.push(`<headerFooter><oddFooter>${footerLeft}&amp;RPágina &amp;P de &amp;N</oddFooter></headerFooter>`);
  parts.push("</worksheet>");
  return parts.join("");
}

function stylesXml(moneyFormat: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="${xmlEscape(moneyFormat)}"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm"/></numFmts>
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFDF3D7"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FF9CA3AF"/></left><right style="thin"><color rgb="FF9CA3AF"/></right><top style="thin"><color rgb="FF9CA3AF"/></top><bottom style="thin"><color rgb="FF9CA3AF"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="15">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="3" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="3" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

/** Arma los archivos XML del libro (sin comprimir). Expuesto para pruebas. */
export function buildWorkbookFiles(spec: WorkbookSpec): { name: string; data: string }[] {
  if (!spec.sheets.length) throw new Error("El libro necesita al menos una hoja");
  const used = new Set<string>();
  const names = spec.sheets.map((s) => {
    let n = safeSheetName(s.name);
    let i = 2;
    while (used.has(n.toLowerCase())) n = safeSheetName(`${s.name.slice(0, 27)} (${i++})`);
    used.add(n.toLowerCase());
    return n;
  });

  const files: { name: string; data: string }[] = [];
  files.push({
    name: "[Content_Types].xml",
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
  });
  files.push({
    name: "_rels/.rels",
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`,
  });
  files.push({
    name: "docProps/core.xml",
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(spec.title ?? "Reporte")}</dc:title><dc:creator>ShaarPass</dc:creator></cp:coreProperties>`,
  });

  const defined: string[] = [];
  spec.sheets.forEach((s, i) => {
    const q = quoteSheet(names[i]);
    if (s.autoFilterRow) {
      const colCount = Math.max(s.columns.length, ...s.rows.map((r) => r.length), 1);
      const last = Math.max(s.autoFilterLastRow ?? s.rows.length, s.autoFilterRow);
      defined.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xmlEscape(`${q}!$A$${s.autoFilterRow}:$${colLetter(colCount - 1)}$${last}`)}</definedName>`);
    }
    if (s.print?.repeatHeaderRow) {
      const r = s.print.repeatHeaderRow;
      defined.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${xmlEscape(`${q}!$${r}:$${r}`)}</definedName>`);
    }
  });

  files.push({
    name: "xl/workbook.xml",
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0"/></bookViews>
<sheets>${names.map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
${defined.length ? `<definedNames>${defined.join("")}</definedNames>` : ""}
</workbook>`,
  });
  files.push({
    name: "xl/_rels/workbook.xml.rels",
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  });
  files.push({ name: "xl/styles.xml", data: stylesXml(spec.moneyFormat ?? `#,##0.00`) });
  spec.sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) }));
  return files;
}

// ───────────────────────── ZIP ─────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Empaqueta archivos en un ZIP (deflate). Suficiente para .xlsx. */
export function zip(files: { name: string; data: string | Uint8Array }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  // Fecha DOS fija (1980-01-01 00:00) → archivo reproducible byte a byte.
  const DOS_TIME = 0;
  const DOS_DATE = (0 << 9) | (1 << 5) | 1;

  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const raw = typeof f.data === "string" ? Buffer.from(f.data, "utf8") : Buffer.from(f.data);
    const comp = deflateRawSync(raw);
    const crc = crc32(raw);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);           // versión necesaria
    lh.writeUInt16LE(0x0800, 6);       // bandera UTF-8
    lh.writeUInt16LE(8, 8);            // deflate
    lh.writeUInt16LE(DOS_TIME, 10);
    lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, name, comp);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(DOS_TIME, 12);
    ch.writeUInt16LE(DOS_DATE, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);

    offset += lh.length + name.length + comp.length;
  }

  const centralSize = centrals.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** Genera el .xlsx completo. */
export function buildXlsx(spec: WorkbookSpec): Buffer {
  return zip(buildWorkbookFiles(spec));
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
