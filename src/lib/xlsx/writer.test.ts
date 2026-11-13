/**
 * Generador de .xlsx: ZIP íntegro, XML con escapes correctos, tipos de celda,
 * filtros, fila congelada y configuración de impresión.
 */
import { describe, it, expect } from "vitest";
import { buildXlsx, buildWorkbookFiles, colLetter, crc32, excelSerial, moneyFormatFor, safeSheetName, xmlEscape } from "./writer";
import { readWorkbook, unzip } from "@/test/xlsxRead";

describe("utilidades", () => {
  it("colLetter", () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(colLetter)).toEqual(["A", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  });
  it("crc32 con vector conocido", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });
  it("xmlEscape escapa y quita caracteres de control", () => {
    expect(xmlEscape(`a<b>&"c"\u0001`)).toBe("a&lt;b&gt;&amp;&quot;c&quot;");
  });
  it("safeSheetName", () => {
    expect(safeSheetName("a/b:c*?[x]")).toBe("a b c   x");
    expect(safeSheetName("x".repeat(40))).toHaveLength(31);
  });
  it("excelSerial: 1900-01-01 + días", () => {
    expect(excelSerial(new Date(Date.UTC(2026, 0, 1, 12, 0)))).toBeCloseTo(46023.5, 6);
  });
  it("moneyFormatFor", () => {
    expect(moneyFormatFor("mxn")).toContain(`"$"#,##0.00`);
    expect(moneyFormatFor("eur")).toContain("€");
  });
});

describe("buildXlsx", () => {
  const spec = {
    title: "Prueba",
    moneyFormat: moneyFormatFor("mxn"),
    sheets: [{
      name: "Hoja/1",
      columns: [10, 20, 12],
      rows: [
        [{ v: "Título", s: "title" as const }],
        [{ v: "N.º", s: "header" as const }, { v: "Nombre", s: "header" as const }, { v: "Total", s: "header" as const }],
        [1, `=HYPERLINK("http://mal")`, { v: 12.5, s: "money" as const }],
        [2, "Ana <López> & \"Co\"", { v: new Date(Date.UTC(2026, 10, 1, 10, 30)), s: "date" as const }],
        [3, null, undefined],
      ],
      freezeRows: 2,
      autoFilterRow: 2,
      print: { landscape: true, fitToWidth: true, repeatHeaderRow: 2, footer: "Evento & Co" },
    }],
  };

  it("produce un ZIP íntegro con las partes obligatorias de SpreadsheetML", () => {
    const files = unzip(buildXlsx(spec));
    for (const f of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]) {
      expect(files.has(f), f).toBe(true);
    }
  });

  it("celdas: texto como inlineStr (nunca fórmula), números y fechas como número", () => {
    const [sheet] = readWorkbook(buildXlsx(spec));
    expect(sheet.name).toBe("Hoja 1");
    expect(sheet.cells.get("B3")).toBe(`=HYPERLINK("http://mal")`);
    expect(sheet.xml).not.toContain("<f>");
    expect(sheet.cells.get("C3")).toBe(12.5);
    expect(sheet.cells.get("B4")).toBe('Ana <López> & "Co"');
    expect(typeof sheet.cells.get("C4")).toBe("number");
    expect(sheet.cells.has("B5")).toBe(false); // vacío ≠ cero
  });

  it("fila congelada, filtro automático, impresión horizontal ajustada al ancho y encabezado repetido", () => {
    const files = buildWorkbookFiles(spec);
    const sheet = files.find((f) => f.name === "xl/worksheets/sheet1.xml")!.data;
    expect(sheet).toContain(`<pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/>`);
    expect(sheet).toContain(`<autoFilter ref="A2:C5"/>`);
    expect(sheet).toContain(`orientation="landscape" fitToWidth="1" fitToHeight="0"`);
    expect(sheet).toContain(`<pageSetUpPr fitToPage="1"/>`);
    expect(sheet).toContain("Evento &amp;&amp; Co");
    const wb = files.find((f) => f.name === "xl/workbook.xml")!.data;
    expect(wb).toContain(`<definedName name="_xlnm.Print_Titles" localSheetId="0">'Hoja 1'!$2:$2</definedName>`);
    expect(wb).toContain(`_xlnm._FilterDatabase`);
    // Orden de elementos exigido por el esquema de Excel.
    const order = ["<sheetPr>", "<dimension", "<sheetViews>", "<sheetFormatPr", "<cols>", "<sheetData>", "<autoFilter", "<printOptions", "<pageMargins", "<pageSetup", "<headerFooter>"];
    const idx = order.map((t) => sheet.indexOf(t));
    expect(idx.every((v) => v >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it("nombres de hoja duplicados se desambiguan", () => {
    const files = buildWorkbookFiles({ sheets: [{ name: "A", columns: [], rows: [] }, { name: "a", columns: [], rows: [] }] });
    const wb = files.find((f) => f.name === "xl/workbook.xml")!.data;
    expect(wb).toContain(`name="A"`);
    expect(wb).toContain(`name="a (2)"`);
  });
});
