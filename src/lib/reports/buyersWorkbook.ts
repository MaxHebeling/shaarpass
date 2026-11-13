/**
 * Convierte el reporte de compradores en un libro de Excel.
 *
 *  - "Compradores":        una fila por compra (cantidad de boletos, importes, estado).
 *  - "Resumen":            totales de boletos, importes y conciliación.
 *  - "Por tipo de boleto": cantidades por categoría.
 *  - "Lista de acceso":    versión para imprimir en la entrada (solo compras pagadas).
 *
 * `financial = false` (roles staff/scanner) omite TODA columna o fila con dinero.
 */
import type { Cell, CellValue, SheetSpec, WorkbookSpec } from "@/lib/xlsx/writer";
import { moneyFormatFor } from "@/lib/xlsx/writer";
import {
  FILTER_LABEL, summarize, summarizeByType, wallClock,
  type BuyerRow, type ReportFilters,
} from "./buyersReport";

export interface WorkbookContext {
  eventTitle: string;
  currency: string;
  timeZone: string;
  ticketTypes: { id: string; name: string }[];
  customFields: { key: string; label: string }[];
  filters: ReportFilters;
  financial: boolean;
  generatedAt: Date;
}

const money = (cents: number | null | undefined, style: "money" | "moneyTotal" = "money"): Cell =>
  ({ v: cents == null ? null : cents / 100, s: style });
const int = (n: number | null | undefined, style: "int" | "intTotal" = "int"): Cell => ({ v: n ?? null, s: style });
const header = (v: string): Cell => ({ v, s: "header" });

function filterDescription(ctx: WorkbookContext): string {
  const parts = [FILTER_LABEL[ctx.filters.status]];
  if (ctx.filters.q) parts.push(`búsqueda "${ctx.filters.q}"`);
  return parts.join(" · ");
}

function generatedAt(ctx: WorkbookContext): string {
  const gen = wallClock(ctx.generatedAt.toISOString(), ctx.timeZone);
  return gen ? gen.toISOString().slice(0, 16).replace("T", " ") : "";
}

function subtitle(ctx: WorkbookContext): Cell {
  const cur = ctx.financial ? ` · Importes en ${ctx.currency.toUpperCase()}` : "";
  return { v: `Generado ${generatedAt(ctx)} (hora del evento) · Filtro: ${filterDescription(ctx)}${cur}`, s: "muted" };
}

function customValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

// ───────────────────────── Hoja 1: Compradores ─────────────────────────

function buyersSheet(rows: BuyerRow[], ctx: WorkbookContext): SheetSpec {
  type Col = { h: string; w: number; get: (r: BuyerRow, i: number) => Cell | CellValue; total?: (rs: BuyerRow[]) => Cell; fin?: boolean };
  const cols: Col[] = [
    { h: "N.º", w: 6, get: (_r, i) => int(i + 1) },
    { h: "Comprador", w: 28, get: (r) => r.buyerName },
    { h: "Correo electrónico", w: 30, get: (r) => r.email },
    { h: "Teléfono", w: 16, get: (r) => r.phone },
    { h: "Evento", w: 24, get: () => ctx.eventTitle },
    { h: "Tipo de boleto", w: 26, get: (r) => ({ v: r.typeLabel, s: "wrap" }) },
    { h: "Cantidad de boletos", w: 11, get: (r) => int(r.quantity), total: (rs) => int(rs.reduce((s, r) => s + r.quantity, 0), "intTotal") },
    { h: "Precio unitario", w: 13, fin: true, get: (r) => money(r.unitPriceCents) },
    { h: "Subtotal (boletos)", w: 14, fin: true, get: (r) => money(r.grossCents), total: (rs) => money(rs.reduce((s, r) => s + r.grossCents, 0), "moneyTotal") },
    { h: "Descuentos", w: 12, fin: true, get: (r) => money(r.discountCents), total: (rs) => money(rs.reduce((s, r) => s + r.discountCents, 0), "moneyTotal") },
    { h: "Cargos y extras", w: 12, fin: true, get: (r) => money(r.chargesCents), total: (rs) => money(rs.reduce((s, r) => s + r.chargesCents, 0), "moneyTotal") },
    { h: "Total de la orden", w: 14, fin: true, get: (r) => money(r.totalCents), total: (rs) => money(rs.reduce((s, r) => s + r.totalCents, 0), "moneyTotal") },
    { h: "Total pagado", w: 14, fin: true, get: (r) => money(r.paidCents), total: (rs) => money(rs.reduce((s, r) => s + r.paidCents, 0), "moneyTotal") },
    { h: "Reembolsado", w: 13, fin: true, get: (r) => money(r.refundedCents), total: (rs) => money(rs.reduce((s, r) => s + r.refundedCents, 0), "moneyTotal") },
    { h: "Pendiente de cobro", w: 13, fin: true, get: (r) => money(r.pendingCents), total: (rs) => money(rs.reduce((s, r) => s + r.pendingCents, 0), "moneyTotal") },
    { h: "Estado del pago", w: 18, get: (r) => r.statusLabel },
    { h: "Método de pago", w: 16, fin: true, get: (r) => r.paymentMethodLabel },
    { h: "Fecha de compra", w: 17, get: (r) => ({ v: wallClock(r.purchasedAt, ctx.timeZone), s: "date" }) },
    { h: "Folio", w: 11, get: (r) => r.folio },
    { h: "Estado de boletos", w: 22, get: (r) => r.ticketLabel },
    ...ctx.customFields.map<Col>((f) => ({ h: f.label, w: 18, get: (r) => customValue(r.customData[f.key]) })),
    { h: "Observaciones", w: 34, get: (r) => ({ v: r.notes.join(" · "), s: "wrap" }) },
    { h: "ID de compra", w: 38, get: (r) => r.orderId },
  ];
  const visible = cols.filter((c) => ctx.financial || !c.fin);

  const out: (Cell | CellValue)[][] = [];
  out.push([{ v: `Compradores — ${ctx.eventTitle}`, s: "title" }]);
  out.push([subtitle(ctx)]);
  out.push(visible.map((c) => header(c.h)));
  rows.forEach((r, i) => out.push(visible.map((c) => c.get(r, i))));
  const lastDataRow = out.length;
  if (rows.length) {
    out.push([]);
    out.push(visible.map((c, ci) => (ci === 1 ? { v: `TOTALES (${rows.length} ${rows.length === 1 ? "compra" : "compras"})`, s: "label" } : c.total ? c.total(rows) : null)));
  } else {
    out.push([{ v: "No hay compras con los filtros seleccionados.", s: "muted" }]);
  }
  return {
    name: "Compradores",
    columns: visible.map((c) => c.w),
    rows: out,
    freezeRows: 3,
    autoFilterRow: 3,
    autoFilterLastRow: Math.max(lastDataRow, 3),
    print: { landscape: true, fitToWidth: true, repeatHeaderRow: 3, footer: `${ctx.eventTitle} — Compradores` },
  };
}

// ───────────────────────── Hoja 2: Resumen ─────────────────────────

function summarySheet(rows: BuyerRow[], ctx: WorkbookContext): SheetSpec {
  const s = summarize(rows);
  const out: (Cell | CellValue)[][] = [];
  const section = (t: string) => { out.push([]); out.push([header(t), header("")]); };
  const line = (label: string, value: Cell, note?: string) => out.push([label, value, note ? { v: note, s: "muted" } : null]);

  out.push([{ v: `Resumen del evento — ${ctx.eventTitle}`, s: "title" }]);
  out.push([subtitle(ctx)]);

  section("Compradores");
  line("Compradores únicos con compra pagada", int(s.buyersWithPaidPurchase, "intTotal"), "Por correo electrónico; ventas en puerta sin correo cuentan una por orden.");
  line("Compradores en este reporte", int(s.buyersInReport));
  line("Órdenes en este reporte", int(s.orders));

  section("Boletos");
  line("Boletos vendidos (pagados + cortesía)", int(s.ticketsSold, "intTotal"));
  line("   Boletos pagados (con cobro)", int(s.ticketsPaid));
  line("   Boletos de cortesía / gratis", int(s.ticketsCourtesy));
  line("Boletos pendientes de pago (ficha OXXO/SPEI emitida)", int(s.ticketsAwaitingPayment));
  line("Boletos en checkout sin completar", int(s.ticketsCheckoutIncomplete), "El comprador inició el pago pero no lo terminó.");
  line("Boletos reembolsados", int(s.ticketsRefunded));
  line("Boletos cancelados o con pago fallido", int(s.ticketsCancelled));
  line("Boletos emitidos vigentes (de compras pagadas)", int(s.ticketsIssuedActive));
  line("   De ellos, ya registrados en la entrada", int(s.ticketsCheckedIn));

  if (ctx.financial) {
    section(`Importes (${ctx.currency.toUpperCase()})`);
    line("Importe efectivamente cobrado", money(s.collectedCents, "moneyTotal"), "Solo órdenes con pago confirmado.");
    line("Importe pendiente de cobro (ficha OXXO/SPEI emitida)", money(s.awaitingPaymentCents));
    line("Importe en checkouts sin completar", money(s.checkoutIncompleteCents), "No es dinero por cobrar asegurado.");
    line("Total de descuentos (compras pagadas)", money(s.discountsPaidCents));
    line("Total reembolsado", money(s.refundedCents));

    section("Conciliación de compras pagadas");
    line("Boletos a precio de venta (cantidad × precio unitario)", money(s.grossPaidCents));
    line("(−) Descuentos", money(s.discountsPaidCents));
    line("(+) Cargos por servicio y extras", money(s.chargesPaidCents));
    line("(=) Importe cobrado", money(s.collectedCents, "moneyTotal"));
    line("Diferencia", money(s.reconciliationDiffCents), s.reconciliationDiffCents === 0 ? "Cuadra." : "No cuadra: revisa la columna Observaciones de la hoja Compradores.");
  }

  section("Verificación");
  line("Boletos emitidos vigentes − boletos vendidos", int(s.ticketsIssuedDiff), s.ticketsIssuedDiff === 0 ? "Cuadra." : "No cuadra: revisa la columna Observaciones de la hoja Compradores.");
  line("Compras marcadas para revisar", int(s.rowsNeedingReview));

  return {
    name: "Resumen",
    columns: [52, 18, 60],
    rows: out,
    print: { fitToWidth: true, footer: `${ctx.eventTitle} — Resumen` },
  };
}

// ───────────────────────── Hoja 3: Por tipo de boleto ─────────────────────────

function typesSheet(rows: BuyerRow[], ctx: WorkbookContext): SheetSpec {
  const types = summarizeByType(rows, ctx.ticketTypes);
  const heads = ["Tipo de boleto", "Vendidos (pagados + cortesía)", "De cortesía", "Pendientes de pago", "Checkout sin completar", "Reembolsados", "Cancelados / fallidos"];
  if (ctx.financial) heads.push(`Venta a precio de lista pagada (${ctx.currency.toUpperCase()})`);
  const out: (Cell | CellValue)[][] = [];
  out.push([{ v: `Boletos por tipo — ${ctx.eventTitle}`, s: "title" }]);
  out.push([subtitle(ctx)]);
  out.push(heads.map(header));
  for (const t of types) {
    const r: (Cell | CellValue)[] = [t.name, int(t.sold), int(t.courtesy), int(t.awaitingPayment), int(t.checkoutIncomplete), int(t.refunded), int(t.cancelled)];
    if (ctx.financial) r.push(money(t.grossPaidCents));
    out.push(r);
  }
  const sum = (k: keyof typeof types[number]) => types.reduce((s, t) => s + (t[k] as number), 0);
  const tot: (Cell | CellValue)[] = [{ v: "TOTAL", s: "label" }, int(sum("sold"), "intTotal"), int(sum("courtesy"), "intTotal"), int(sum("awaitingPayment"), "intTotal"), int(sum("checkoutIncomplete"), "intTotal"), int(sum("refunded"), "intTotal"), int(sum("cancelled"), "intTotal")];
  if (ctx.financial) tot.push(money(sum("grossPaidCents"), "moneyTotal"));
  out.push(tot);
  if (ctx.financial) {
    out.push([]);
    out.push([{ v: "La venta a precio de lista es antes de descuentos y cargos; el importe cobrado real está en la hoja Resumen.", s: "muted" }]);
  }
  return {
    name: "Por tipo de boleto",
    columns: [28, 16, 12, 14, 14, 13, 14, 22],
    rows: out,
    freezeRows: 3,
    print: { landscape: true, fitToWidth: true, repeatHeaderRow: 3, footer: `${ctx.eventTitle} — Por tipo de boleto` },
  };
}

// ───────────────────────── Hoja 4: Lista de acceso (impresión) ─────────────────────────

function accessSheet(rows: BuyerRow[], ctx: WorkbookContext): SheetSpec {
  // Solo compras pagadas con boletos vigentes: es la lista de quién puede entrar.
  const paid = rows.filter((r) => r.status === "paid" && r.quantity > 0);
  const out: (Cell | CellValue)[][] = [];
  out.push([{ v: `Lista de acceso — ${ctx.eventTitle}`, s: "title" }]);
  const search = ctx.filters.q ? ` · búsqueda "${ctx.filters.q}"` : "";
  out.push([{ v: `Generado ${generatedAt(ctx)} (hora del evento) · Solo compras pagadas (incluye cortesías)${search} · Ordenado por comprador`, s: "muted" }]);
  out.push(["N.º", "Comprador", "Correo electrónico", "Teléfono", "Tipo de boleto", "Boletos", "Folio", "Llegó", "Notas"].map(header));
  paid.forEach((r, i) => out.push([
    { v: i + 1, s: "boxInt" },
    { v: r.buyerName, s: "box" },
    { v: r.email, s: "box" },
    { v: r.phone, s: "box" },
    { v: r.typeLabel, s: "box" },
    { v: r.quantity, s: "boxInt" },
    { v: r.folio, s: "box" },
    { v: "☐", s: "boxCheck" },
    { v: r.tickets.checkedIn ? `${r.tickets.checkedIn} ya registrado(s)` : null, s: "box" },
  ]));
  const lastDataRow = out.length;
  out.push([]);
  out.push([null, { v: `TOTAL: ${paid.length} ${paid.length === 1 ? "compra" : "compras"}`, s: "label" }, null, null, { v: "Boletos", s: "label" }, int(paid.reduce((s, r) => s + r.quantity, 0), "intTotal")]);
  return {
    name: "Lista de acceso",
    columns: [6, 28, 28, 15, 24, 9, 11, 7, 18],
    rows: out,
    freezeRows: 3,
    autoFilterRow: 3,
    autoFilterLastRow: Math.max(lastDataRow, 3),
    print: { landscape: true, fitToWidth: true, repeatHeaderRow: 3, footer: `${ctx.eventTitle} — Lista de acceso` },
  };
}

export type ReportView = "full" | "print";

/**
 * @param rows        compras ya filtradas (estado + búsqueda) y ordenadas.
 * @param accessRows  compras para la lista de acceso: misma búsqueda, pero siempre
 *                    las pagadas (quien no pagó no entra, sea cual sea el filtro).
 */
export function buildBuyersWorkbook(rows: BuyerRow[], accessRows: BuyerRow[], ctx: WorkbookContext, view: ReportView): WorkbookSpec {
  const sheets = view === "print"
    ? [accessSheet(accessRows, ctx)]
    : [buyersSheet(rows, ctx), summarySheet(rows, ctx), typesSheet(rows, ctx), accessSheet(accessRows, ctx)];
  return { sheets, moneyFormat: moneyFormatFor(ctx.currency), title: `${ctx.eventTitle} — Compradores` };
}
