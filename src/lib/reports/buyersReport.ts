/**
 * Reporte de compradores de un evento: una fila por COMPRA (orden), con la
 * cantidad de boletos comprados, desglose por tipo, importes y estado real del
 * pago, más el resumen y la conciliación del evento.
 *
 * Fuente de verdad (esquema real, ver supabase/migrations):
 *  - orders        → comprador, estado del pago, subtotal (ya con descuento),
 *                    discount_cents, total_cents (lo cobrado al comprador: boletos
 *                    − descuento + cargos/extras), paid_at.
 *  - order_items   → cantidad y precio unitario por tipo de boleto (lo COMPRADO).
 *  - tickets       → boletos EMITIDOS y su estado (valid / checked_in / refunded / void).
 *
 * Reglas:
 *  - La cantidad de boletos sale de order_items (lo comprado), nunca de contar
 *    filas de un JOIN, para no duplicar.
 *  - "Total pagado" solo cuenta órdenes con status = 'paid'. Una orden pendiente
 *    jamás aparece como pagada; una reembolsada se reporta en "Reembolsado".
 *  - El sistema solo hace reembolsos completos (RPC refund_order) y no admite
 *    pagos parciales: no se inventan esos estados.
 *  - Cortesía = orden pagada con total 0 (evento gratis, código del 100 %).
 *  - Los importes vienen de las órdenes; no se recalculan como precio × cantidad.
 *  - `null` = dato faltante; `0` = cero real.
 */

export type OrderStatus = "pending" | "awaiting_payment" | "paid" | "failed" | "refunded" | "cancelled";

export interface OrderInput {
  id: string;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  status: string;
  subtotal_cents: number;
  discount_cents: number | null;
  total_cents: number;
  created_at: string;
  paid_at: string | null;
  payment_method: string | null;
  custom_data?: Record<string, unknown> | null;
}

export interface ItemInput {
  order_id: string;
  ticket_type_id: string;
  quantity: number;
  unit_price_cents: number;
}

export interface TicketInput {
  order_id: string;
  status: string;
}

export type StatusFilter = "all" | "paid" | "pending" | "refunded" | "cancelled";

export interface ReportFilters {
  status: StatusFilter;
  q: string;
}

export interface TypeLine {
  ticketTypeId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface TicketCounts {
  valid: number;
  checkedIn: number;
  refunded: number;
  void: number;
}

export interface BuyerRow {
  orderId: string;
  folio: string;
  buyerName: string;
  email: string | null;
  phone: string | null;
  isDoorSale: boolean;
  lines: TypeLine[];
  typeLabel: string;
  /** Boletos comprados en la orden (Σ order_items.quantity). */
  quantity: number;
  /** Precio unitario si la compra tiene un solo precio; si mezcla precios, null. */
  unitPriceCents: number | null;
  /** Σ cantidad × precio unitario (antes de descuentos y cargos). */
  grossCents: number;
  discountCents: number;
  /** Cargos por servicio y extras = total − subtotal (lo que no es boleto). */
  chargesCents: number;
  /** Importe total de la orden (lo que se cobra / cobró al comprador). */
  totalCents: number;
  /** Importe efectivamente cobrado y vigente (solo órdenes pagadas). */
  paidCents: number;
  refundedCents: number;
  /** Importe por cobrar (ficha OXXO/SPEI emitida o checkout sin completar). */
  pendingCents: number;
  status: OrderStatus | string;
  statusLabel: string;
  isCourtesy: boolean;
  paymentMethodLabel: string;
  purchasedAt: string;
  tickets: TicketCounts;
  ticketLabel: string;
  notes: string[];
  customData: Record<string, unknown>;
}

export interface TypeSummary {
  ticketTypeId: string;
  name: string;
  sold: number;
  courtesy: number;
  awaitingPayment: number;
  checkoutIncomplete: number;
  refunded: number;
  cancelled: number;
  /** Σ cantidad × precio unitario de las órdenes pagadas (antes de descuentos). */
  grossPaidCents: number;
}

export interface ReportSummary {
  orders: number;
  buyersInReport: number;
  buyersWithPaidPurchase: number;
  ticketsSold: number;          // pagados + cortesía
  ticketsPaid: number;          // con cobro (> 0)
  ticketsCourtesy: number;
  ticketsAwaitingPayment: number;
  ticketsCheckoutIncomplete: number;
  ticketsRefunded: number;
  ticketsCancelled: number;     // cancelados + pago fallido
  ticketsIssuedActive: number;  // emitidos vigentes o usados (de órdenes pagadas)
  ticketsCheckedIn: number;
  grossPaidCents: number;
  discountsPaidCents: number;
  chargesPaidCents: number;
  collectedCents: number;
  awaitingPaymentCents: number;
  checkoutIncompleteCents: number;
  refundedCents: number;
  /** grossPaid − descuentos + cargos − cobrado. Debe ser 0. */
  reconciliationDiffCents: number;
  /** boletos emitidos vigentes − boletos vendidos. Debe ser 0. */
  ticketsIssuedDiff: number;
  rowsNeedingReview: number;
}

export const STATUS_LABEL: Record<string, string> = {
  paid: "Pagado",
  awaiting_payment: "Pendiente de pago",
  pending: "Pago no completado",
  failed: "Pago fallido",
  refunded: "Reembolsado",
  cancelled: "Cancelado",
};

export const FILTER_LABEL: Record<StatusFilter, string> = {
  all: "Todas las órdenes",
  paid: "Pagadas (incluye cortesías)",
  pending: "Pendientes de pago",
  refunded: "Reembolsadas",
  cancelled: "Canceladas o con pago fallido",
};

const METHOD_LABEL: Record<string, string> = {
  card: "Tarjeta",
  oxxo: "OXXO",
  spei: "SPEI",
  customer_balance: "Transferencia",
  mercadopago: "Mercado Pago",
};

export function paymentMethodLabel(method: string | null): string {
  if (!method) return "";
  if (method.startsWith("puerta-")) {
    const m = method.slice("puerta-".length);
    const inner = m === "efectivo" ? "efectivo" : m === "tarjeta" ? "tarjeta" : m;
    return `En puerta (${inner})`;
  }
  return METHOD_LABEL[method] ?? method;
}

/** Normaliza texto para buscar/ordenar sin acentos ni mayúsculas. */
export function norm(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function parseFilters(params: URLSearchParams): ReportFilters {
  const raw = params.get("status") ?? "all";
  const status: StatusFilter = (["all", "paid", "pending", "refunded", "cancelled"] as const).includes(raw as StatusFilter)
    ? (raw as StatusFilter) : "all";
  const q = (params.get("q") ?? "").slice(0, 100);
  return { status, q };
}

export function matchesStatus(status: string, f: StatusFilter): boolean {
  switch (f) {
    case "all": return true;
    case "paid": return status === "paid";
    case "pending": return status === "pending" || status === "awaiting_payment";
    case "refunded": return status === "refunded";
    case "cancelled": return status === "cancelled" || status === "failed";
  }
}

const DOOR_EMAIL = /^puerta\+[0-9a-f]{8}@shaarpass\.io$/i;

function ticketLabel(t: TicketCounts): string {
  const parts: string[] = [];
  if (t.valid) parts.push(`${t.valid} ${t.valid === 1 ? "vigente" : "vigentes"}`);
  if (t.checkedIn) parts.push(`${t.checkedIn} ${t.checkedIn === 1 ? "usado" : "usados"}`);
  if (t.refunded) parts.push(`${t.refunded} ${t.refunded === 1 ? "reembolsado" : "reembolsados"}`);
  if (t.void) parts.push(`${t.void} ${t.void === 1 ? "anulado" : "anulados"}`);
  return parts.length ? parts.join(" · ") : "Sin boletos emitidos";
}

/** Construye una fila por orden. No filtra: ver `applyFilters`. */
export function buildRows(
  orders: OrderInput[],
  items: ItemInput[],
  tickets: TicketInput[],
  typeNames: Map<string, string>,
): BuyerRow[] {
  const itemsByOrder = new Map<string, ItemInput[]>();
  for (const it of items) {
    const arr = itemsByOrder.get(it.order_id) ?? [];
    arr.push(it);
    itemsByOrder.set(it.order_id, arr);
  }
  const ticketsByOrder = new Map<string, TicketCounts>();
  for (const t of tickets) {
    const c = ticketsByOrder.get(t.order_id) ?? { valid: 0, checkedIn: 0, refunded: 0, void: 0 };
    if (t.status === "valid") c.valid++;
    else if (t.status === "checked_in") c.checkedIn++;
    else if (t.status === "refunded") c.refunded++;
    else if (t.status === "void") c.void++;
    ticketsByOrder.set(t.order_id, c);
  }

  // Órdenes únicas (por si la fuente trae duplicados al paginar).
  const seen = new Set<string>();
  const rows: BuyerRow[] = [];
  for (const o of orders) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);

    // Agrupa líneas del mismo tipo y precio.
    const lineMap = new Map<string, TypeLine>();
    for (const it of itemsByOrder.get(o.id) ?? []) {
      const key = `${it.ticket_type_id}|${it.unit_price_cents}`;
      const prev = lineMap.get(key);
      if (prev) prev.quantity += it.quantity;
      else lineMap.set(key, {
        ticketTypeId: it.ticket_type_id,
        name: typeNames.get(it.ticket_type_id) ?? "Tipo eliminado",
        quantity: it.quantity,
        unitPriceCents: it.unit_price_cents,
      });
    }
    const lines = [...lineMap.values()].sort((a, b) => b.unitPriceCents - a.unitPriceCents || a.name.localeCompare(b.name, "es"));
    const quantity = lines.reduce((s, l) => s + l.quantity, 0);
    const grossCents = lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
    const prices = new Set(lines.map((l) => l.unitPriceCents));
    const unitPriceCents = prices.size === 1 ? lines[0].unitPriceCents : null;
    const typeLabel = lines.length === 0
      ? ""
      : lines.length === 1
        ? lines[0].name
        : lines.map((l) => `${l.name} ×${l.quantity}`).join(", ");

    const total = o.total_cents ?? 0;
    const subtotal = o.subtotal_cents ?? 0;
    // El descuento nunca supera el valor de los boletos (checkout hace max(0, bruto − descuento)).
    const rawDiscount = Math.max(0, o.discount_cents ?? 0);
    const discountCents = lines.length ? Math.min(rawDiscount, grossCents) : rawDiscount;
    const chargesCents = total - subtotal;

    const status = o.status;
    const isPaid = status === "paid";
    const isCourtesy = isPaid && total === 0;
    const paidCents = isPaid ? total : 0;
    const refundedCents = status === "refunded" ? total : 0;
    const pendingCents = status === "awaiting_payment" || status === "pending" ? total : 0;

    const t = ticketsByOrder.get(o.id) ?? { valid: 0, checkedIn: 0, refunded: 0, void: 0 };
    const notes: string[] = [];
    if (isPaid && lines.length > 0 && t.valid + t.checkedIn !== quantity) {
      notes.push(`Revisar: ${t.valid + t.checkedIn} boletos vigentes de ${quantity} comprados`);
    }
    if (lines.length > 0 && grossCents - discountCents + chargesCents !== total) {
      notes.push("Revisar importes: boletos − descuento + cargos ≠ total");
    }
    if (lines.length === 0) notes.push("Orden sin partidas de boletos");

    const email = o.buyer_email && !DOOR_EMAIL.test(o.buyer_email) ? o.buyer_email : null;
    const isDoorSale = !!o.payment_method?.startsWith("puerta-") || (!!o.buyer_email && DOOR_EMAIL.test(o.buyer_email));

    rows.push({
      orderId: o.id,
      folio: o.id.replace(/-/g, "").slice(0, 8).toUpperCase(),
      buyerName: o.buyer_name?.trim() || (isDoorSale ? "Venta en puerta" : email ?? ""),
      email,
      phone: o.buyer_phone?.trim() || null,
      isDoorSale,
      lines,
      typeLabel,
      quantity,
      unitPriceCents,
      grossCents,
      discountCents,
      chargesCents,
      totalCents: total,
      paidCents,
      refundedCents,
      pendingCents,
      status,
      statusLabel: isCourtesy ? "Cortesía / gratis" : STATUS_LABEL[status] ?? status,
      isCourtesy,
      paymentMethodLabel: isCourtesy && !o.payment_method ? "Sin cobro" : paymentMethodLabel(o.payment_method),
      purchasedAt: o.paid_at ?? o.created_at,
      tickets: t,
      ticketLabel: ticketLabel(t),
      notes,
      customData: (o.custom_data ?? {}) as Record<string, unknown>,
    });
  }
  return rows;
}

/** Aplica los filtros de la pantalla y ordena por comprador (A–Z) y fecha. */
export function applyFilters(rows: BuyerRow[], f: ReportFilters): BuyerRow[] {
  const q = norm(f.q);
  return rows
    .filter((r) => matchesStatus(r.status, f.status))
    .filter((r) => !q || [r.buyerName, r.email, r.phone, r.folio].some((v) => norm(v).includes(q)))
    .sort((a, b) =>
      norm(a.buyerName).localeCompare(norm(b.buyerName), "es") ||
      a.purchasedAt.localeCompare(b.purchasedAt));
}

export function summarize(rows: BuyerRow[]): ReportSummary {
  const s: ReportSummary = {
    orders: rows.length, buyersInReport: 0, buyersWithPaidPurchase: 0,
    ticketsSold: 0, ticketsPaid: 0, ticketsCourtesy: 0, ticketsAwaitingPayment: 0, ticketsCheckoutIncomplete: 0,
    ticketsRefunded: 0, ticketsCancelled: 0, ticketsIssuedActive: 0, ticketsCheckedIn: 0,
    grossPaidCents: 0, discountsPaidCents: 0, chargesPaidCents: 0, collectedCents: 0,
    awaitingPaymentCents: 0, checkoutIncompleteCents: 0, refundedCents: 0,
    reconciliationDiffCents: 0, ticketsIssuedDiff: 0, rowsNeedingReview: 0,
  };
  const buyerKey = (r: BuyerRow) => r.email ? `e:${norm(r.email)}` : `o:${r.orderId}`;
  const all = new Set<string>();
  const paid = new Set<string>();
  for (const r of rows) {
    all.add(buyerKey(r));
    if (r.notes.length) s.rowsNeedingReview++;
    switch (r.status) {
      case "paid":
        paid.add(buyerKey(r));
        s.ticketsSold += r.quantity;
        if (r.isCourtesy) s.ticketsCourtesy += r.quantity; else s.ticketsPaid += r.quantity;
        s.ticketsIssuedActive += r.tickets.valid + r.tickets.checkedIn;
        s.ticketsCheckedIn += r.tickets.checkedIn;
        s.grossPaidCents += r.grossCents;
        s.discountsPaidCents += r.discountCents;
        s.chargesPaidCents += r.chargesCents;
        s.collectedCents += r.paidCents;
        break;
      case "awaiting_payment":
        s.ticketsAwaitingPayment += r.quantity;
        s.awaitingPaymentCents += r.pendingCents;
        break;
      case "pending":
        s.ticketsCheckoutIncomplete += r.quantity;
        s.checkoutIncompleteCents += r.pendingCents;
        break;
      case "refunded":
        s.ticketsRefunded += r.quantity;
        s.refundedCents += r.refundedCents;
        break;
      case "cancelled":
      case "failed":
        s.ticketsCancelled += r.quantity;
        break;
    }
  }
  s.buyersInReport = all.size;
  s.buyersWithPaidPurchase = paid.size;
  s.reconciliationDiffCents = s.grossPaidCents - s.discountsPaidCents + s.chargesPaidCents - s.collectedCents;
  s.ticketsIssuedDiff = s.ticketsIssuedActive - s.ticketsSold;
  return s;
}

export function summarizeByType(rows: BuyerRow[], typeOrder: { id: string; name: string }[]): TypeSummary[] {
  const map = new Map<string, TypeSummary>();
  const get = (id: string, name: string) => {
    let t = map.get(id);
    if (!t) {
      t = { ticketTypeId: id, name, sold: 0, courtesy: 0, awaitingPayment: 0, checkoutIncomplete: 0, refunded: 0, cancelled: 0, grossPaidCents: 0 };
      map.set(id, t);
    }
    return t;
  };
  for (const t of typeOrder) get(t.id, t.name);
  for (const r of rows) {
    for (const l of r.lines) {
      const t = get(l.ticketTypeId, l.name);
      switch (r.status) {
        case "paid":
          t.sold += l.quantity;
          if (r.isCourtesy) t.courtesy += l.quantity;
          t.grossPaidCents += l.quantity * l.unitPriceCents;
          break;
        case "awaiting_payment": t.awaitingPayment += l.quantity; break;
        case "pending": t.checkoutIncomplete += l.quantity; break;
        case "refunded": t.refunded += l.quantity; break;
        case "cancelled": case "failed": t.cancelled += l.quantity; break;
      }
    }
  }
  return [...map.values()];
}

/**
 * Convierte un instante ISO a la "hora de pared" de la zona del evento,
 * representada como Date cuyos campos UTC son esa hora (Excel no maneja zonas).
 */
export function wallClock(iso: string | null | undefined, timeZone: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(d);
  } catch {
    return wallClock(iso, "America/Mexico_City");
  }
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return new Date(Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")));
}
