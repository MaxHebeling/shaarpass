/**
 * Reporte de compradores: cantidades e importes por compra, estados del pago,
 * filtros, totales y conciliación — sobre datos con la forma real del esquema.
 */
import { describe, it, expect } from "vitest";
import {
  applyFilters, buildRows, parseFilters, summarize, summarizeByType, wallClock,
  type ItemInput, type OrderInput, type TicketInput,
} from "./buyersReport";

const GEN = "tt-gen", VIP = "tt-vip";
const types = new Map([[GEN, "General"], [VIP, "VIP"]]);

let seq = 0;
function order(p: Partial<OrderInput> & { id: string }): OrderInput {
  seq++;
  return {
    buyer_name: `Comprador ${seq}`, buyer_email: `c${seq}@test.mx`, buyer_phone: null,
    status: "paid", subtotal_cents: 0, discount_cents: 0, total_cents: 0,
    created_at: `2026-11-0${(seq % 9) + 1}T18:00:00Z`, paid_at: null, payment_method: "card", custom_data: {},
    ...p,
  };
}
const item = (order_id: string, ticket_type_id: string, quantity: number, unit_price_cents: number): ItemInput =>
  ({ order_id, ticket_type_id, quantity, unit_price_cents });
const tix = (order_id: string, ...statuses: string[]): TicketInput[] => statuses.map((status) => ({ order_id, status }));

/**
 * Escenario con todos los casos. Fees: total = subtotal + cargos (comprador paga comisión).
 *  o1  1 General $200, pagado, cargo $15                 → total 215
 *  o2  3 General $200, pagado, sin cargo                 → total 600, 1 ya usado
 *  o3  2 VIP $500 + 2 General $200, pagado, cargo $40    → total 1440
 *  o4  2 General $200, código −$100, pagado, cargo $10   → total 310
 *  o5  1 VIP $500 OXXO, ficha emitida (awaiting_payment) → total 520, sin boletos
 *  o6  2 General, checkout sin completar (pending)       → total 400
 *  o7  1 General, cancelado                              → total 200
 *  o8  2 VIP, reembolsado (boletos refunded)             → total 1000
 *  o9  2 General cortesía (código 100 %), pagado total 0
 *  o10 1 General, pago fallido
 */
const orders: OrderInput[] = [
  order({ id: "o1", buyer_name: "Ana Pérez", buyer_email: "ana@test.mx", subtotal_cents: 20000, total_cents: 21500, paid_at: "2026-11-01T20:00:00Z" }),
  order({ id: "o2", buyer_name: "Beto Ruiz", subtotal_cents: 60000, total_cents: 60000, paid_at: "2026-11-02T20:00:00Z" }),
  order({ id: "o3", buyer_name: "Carla Díaz", subtotal_cents: 140000, total_cents: 144000, paid_at: "2026-11-03T20:00:00Z" }),
  order({ id: "o4", buyer_name: "Dani López", subtotal_cents: 30000, discount_cents: 10000, total_cents: 31000, paid_at: "2026-11-04T20:00:00Z" }),
  order({ id: "o5", buyer_name: "Eva Soto", status: "awaiting_payment", subtotal_cents: 50000, total_cents: 52000, payment_method: "oxxo" }),
  order({ id: "o6", buyer_name: "Fer Gil", status: "pending", subtotal_cents: 40000, total_cents: 40000 }),
  order({ id: "o7", buyer_name: "Gabo Ríos", status: "cancelled", subtotal_cents: 20000, total_cents: 20000 }),
  order({ id: "o8", buyer_name: "Hugo Paz", status: "refunded", subtotal_cents: 100000, total_cents: 100000, paid_at: "2026-11-05T20:00:00Z" }),
  order({ id: "o9", buyer_name: "Inés Mar", subtotal_cents: 0, discount_cents: 40000, total_cents: 0, payment_method: null, paid_at: "2026-11-06T20:00:00Z" }),
  order({ id: "o10", buyer_name: "Juan Lara", status: "failed", subtotal_cents: 20000, total_cents: 20000 }),
  // La segunda compra de Ana (mismo correo, otra orden): compradora única.
  order({ id: "o11", buyer_name: "Ana Pérez", buyer_email: "ANA@test.mx", subtotal_cents: 20000, total_cents: 20000, paid_at: "2026-11-07T20:00:00Z" }),
];
const items: ItemInput[] = [
  item("o1", GEN, 1, 20000),
  item("o2", GEN, 3, 20000),
  item("o3", VIP, 2, 50000), item("o3", GEN, 2, 20000),
  item("o4", GEN, 2, 20000),
  item("o5", VIP, 1, 50000),
  item("o6", GEN, 2, 20000),
  item("o7", GEN, 1, 20000),
  item("o8", VIP, 2, 50000),
  item("o9", GEN, 2, 20000),
  item("o10", GEN, 1, 20000),
  item("o11", GEN, 1, 20000),
];
const tickets: TicketInput[] = [
  ...tix("o1", "valid"),
  ...tix("o2", "valid", "valid", "checked_in"),
  ...tix("o3", "valid", "valid", "valid", "valid"),
  ...tix("o4", "valid", "valid"),
  ...tix("o8", "refunded", "refunded"),
  ...tix("o9", "valid", "valid"),
  ...tix("o11", "valid"),
];

const rows = buildRows(orders, items, tickets, types);
const byId = (id: string) => rows.find((r) => r.orderId === id)!;

describe("una fila por compra con cantidad e importes reales", () => {
  it("1) compra de un boleto", () => {
    const r = byId("o1");
    expect(r).toMatchObject({ quantity: 1, unitPriceCents: 20000, grossCents: 20000, discountCents: 0, chargesCents: 1500, totalCents: 21500, paidCents: 21500, refundedCents: 0, pendingCents: 0, statusLabel: "Pagado", typeLabel: "General" });
    expect(r.ticketLabel).toBe("1 vigente");
    expect(r.notes).toEqual([]);
  });

  it("2) compra de varios boletos (cantidad de order_items, sin duplicar por boletos emitidos)", () => {
    const r = byId("o2");
    expect(r.quantity).toBe(3);
    expect(r.paidCents).toBe(60000);
    expect(r.ticketLabel).toBe("2 vigentes · 1 usado");
  });

  it("3) varias categorías en una compra: desglose por tipo y sin precio unitario único", () => {
    const r = byId("o3");
    expect(r.quantity).toBe(4);
    expect(r.typeLabel).toBe("VIP ×2, General ×2");
    expect(r.unitPriceCents).toBeNull();
    expect(r.grossCents).toBe(140000);
    expect(r.paidCents).toBe(144000);
  });

  it("4) descuento: bruto − descuento + cargos = total", () => {
    const r = byId("o4");
    expect(r).toMatchObject({ grossCents: 40000, discountCents: 10000, chargesCents: 1000, totalCents: 31000, paidCents: 31000 });
    expect(r.notes).toEqual([]);
  });

  it("5) pago pendiente (OXXO): nunca aparece como pagado", () => {
    const r = byId("o5");
    expect(r).toMatchObject({ paidCents: 0, pendingCents: 52000, statusLabel: "Pendiente de pago", paymentMethodLabel: "OXXO" });
    expect(r.ticketLabel).toBe("Sin boletos emitidos");
    expect(byId("o6")).toMatchObject({ paidCents: 0, pendingCents: 40000, statusLabel: "Pago no completado" });
  });

  it("6) pagos parciales: el esquema no los admite → cada orden está pagada completa o no pagada", () => {
    for (const r of rows) {
      expect([0, r.totalCents]).toContain(r.paidCents);
      expect(r.paidCents + r.refundedCents + r.pendingCents).toBeLessThanOrEqual(r.totalCents);
    }
  });

  it("7) compra cancelada y pago fallido: sin importe pagado ni pendiente", () => {
    expect(byId("o7")).toMatchObject({ paidCents: 0, pendingCents: 0, refundedCents: 0, statusLabel: "Cancelado" });
    expect(byId("o10")).toMatchObject({ paidCents: 0, pendingCents: 0, statusLabel: "Pago fallido" });
  });

  it("8) reembolso: el importe va a Reembolsado, no a Pagado", () => {
    expect(byId("o8")).toMatchObject({ paidCents: 0, refundedCents: 100000, statusLabel: "Reembolsado", ticketLabel: "2 reembolsados" });
  });

  it("9) cortesía: pagada con total 0, cantidad real, cero ≠ dato faltante", () => {
    const r = byId("o9");
    expect(r).toMatchObject({ isCourtesy: true, statusLabel: "Cortesía / gratis", quantity: 2, paidCents: 0, totalCents: 0, discountCents: 40000, paymentMethodLabel: "Sin cobro" });
    expect(r.notes).toEqual([]);
  });

  it("marca para revisión una compra pagada con boletos emitidos faltantes", () => {
    const rs = buildRows([order({ id: "x", subtotal_cents: 40000, total_cents: 40000 })], [item("x", GEN, 2, 20000)], tix("x", "valid"), types);
    expect(rs[0].notes[0]).toMatch(/1 boletos vigentes de 2/);
  });

  it("venta en puerta: correo de relleno no se muestra", () => {
    const rs = buildRows([order({ id: "d", buyer_name: null, buyer_email: "puerta+ab12cd34@shaarpass.io", payment_method: "puerta-efectivo", subtotal_cents: 100, total_cents: 100 })], [item("d", GEN, 1, 100)], tix("d", "valid"), types);
    expect(rs[0]).toMatchObject({ buyerName: "Venta en puerta", email: null, paymentMethodLabel: "En puerta (efectivo)" });
  });
});

describe("filtros", () => {
  it("10) por estado y búsqueda (sin acentos, por folio), ordenado por comprador", () => {
    expect(applyFilters(rows, { status: "paid", q: "" }).map((r) => r.orderId)).toEqual(["o1", "o11", "o2", "o3", "o4", "o9"]);
    expect(applyFilters(rows, { status: "pending", q: "" }).map((r) => r.orderId).sort()).toEqual(["o5", "o6"]);
    expect(applyFilters(rows, { status: "cancelled", q: "" }).map((r) => r.orderId).sort()).toEqual(["o10", "o7"]);
    expect(applyFilters(rows, { status: "refunded", q: "" }).map((r) => r.orderId)).toEqual(["o8"]);
    expect(applyFilters(rows, { status: "all", q: "carla diaz" }).map((r) => r.orderId)).toEqual(["o3"]);
    expect(applyFilters(rows, { status: "all", q: byId("o4").folio.toLowerCase() }).map((r) => r.orderId)).toEqual(["o4"]);
  });

  it("parseFilters ignora valores inválidos", () => {
    expect(parseFilters(new URLSearchParams("status=hack&q=ana"))).toEqual({ status: "all", q: "ana" });
    expect(parseFilters(new URLSearchParams("status=paid"))).toEqual({ status: "paid", q: "" });
  });
});

describe("totales y conciliación", () => {
  const s = summarize(rows);

  it("11) totales generales correctos", () => {
    expect(s.orders).toBe(11);
    expect(s.buyersWithPaidPurchase).toBe(5); // Ana (2 órdenes), Beto, Carla, Dani, Inés
    expect(s.ticketsSold).toBe(1 + 3 + 4 + 2 + 2 + 1);
    expect(s.ticketsCourtesy).toBe(2);
    expect(s.ticketsPaid).toBe(s.ticketsSold - 2);
    expect(s.ticketsAwaitingPayment).toBe(1);
    expect(s.ticketsCheckoutIncomplete).toBe(2);
    expect(s.ticketsRefunded).toBe(2);
    expect(s.ticketsCancelled).toBe(2);
    expect(s.ticketsCheckedIn).toBe(1);
    expect(s.collectedCents).toBe(21500 + 60000 + 144000 + 31000 + 0 + 20000);
    expect(s.awaitingPaymentCents).toBe(52000);
    expect(s.checkoutIncompleteCents).toBe(40000);
    expect(s.refundedCents).toBe(100000);
    expect(s.discountsPaidCents).toBe(10000 + 40000);
  });

  it("cobrado ≠ precio × cantidad: la conciliación cuadra con descuentos y cargos", () => {
    expect(s.grossPaidCents).not.toBe(s.collectedCents);
    expect(s.reconciliationDiffCents).toBe(0);
    expect(s.ticketsIssuedDiff).toBe(0);
    expect(s.rowsNeedingReview).toBe(0);
  });

  it("12) sin duplicados: órdenes o partidas repetidas por la paginación no inflan cantidades", () => {
    const dup = buildRows([...orders, orders[1]], items, tickets, types);
    expect(dup).toHaveLength(orders.length);
    expect(summarize(dup).ticketsSold).toBe(s.ticketsSold);
  });

  it("por tipo de boleto", () => {
    const t = summarizeByType(rows, [{ id: VIP, name: "VIP" }, { id: GEN, name: "General" }]);
    expect(t.map((x) => x.name)).toEqual(["VIP", "General"]);
    expect(t[0]).toMatchObject({ sold: 2, awaitingPayment: 1, refunded: 2, grossPaidCents: 100000 });
    expect(t[1]).toMatchObject({ sold: 1 + 3 + 2 + 2 + 2 + 1, courtesy: 2, checkoutIncomplete: 2, cancelled: 2 });
  });
});

describe("wallClock", () => {
  it("convierte a la hora local del evento", () => {
    expect(wallClock("2026-11-01T02:30:00Z", "America/Mexico_City")!.toISOString()).toBe("2026-10-31T20:30:00.000Z");
    expect(wallClock(null, "America/Mexico_City")).toBeNull();
    expect(wallClock("2026-11-01T02:30:00Z", "Zona/Invalida")).not.toBeNull();
  });
});
