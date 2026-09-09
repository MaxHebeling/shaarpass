import { describe, it, expect } from "vitest";
import {
  ourFeeCents,
  marginCents,
  resaleBuyerTotal,
  processingRate,
  eventbriteMxFeeCents,
  eventbriteFeeCents,
  fmt,
  OUR_PERCENT,
  OUR_FIXED_CENTS,
} from "./feeMath";

describe("feeMath — la plataforma nunca pierde dinero", () => {
  it("evento gratis → comisión 0", () => {
    expect(ourFeeCents(0, 1, "mxn")).toBe(0);
  });

  it("comisión positiva en evento de pago", () => {
    expect(ourFeeCents(10000, 1, "mxn")).toBeGreaterThan(0);
  });

  it("la comisión cubre el procesamiento de Stripe (margen no negativo)", () => {
    // Comprador paga: organizerNet + fee. Stripe cobra pct% + fijo sobre el total.
    for (const cur of ["mxn", "usd", "eur"]) {
      const net = 50000, count = 3;
      const fee = ourFeeCents(net, count, cur);
      const total = net + fee;
      const p = processingRate(cur);
      const stripeCost = Math.round((total * p.pct) / 100) + p.fixed;
      // Tras el corte de Stripe, la plataforma retiene algo (no pierde).
      expect(fee - stripeCost).toBeGreaterThanOrEqual(-1);
    }
  });

  it("reventa: el comprador paga más que el precio (gross-up)", () => {
    expect(resaleBuyerTotal(0, "mxn")).toBe(0);
    expect(resaleBuyerTotal(60000, "mxn")).toBeGreaterThan(60000);
  });

  it("México usa la tarifa de Stripe MX (3.6% + $3), no la de EE. UU.", () => {
    expect(processingRate("mxn")).toEqual({ pct: 3.6, fixed: 300 });
  });
});

// La página /precios compara contra estas cifras: si cambian, que se note en CI.
describe("comparación con Eventbrite", () => {
  it("México: 3.99% de servicio + 2% de procesamiento sobre (subtotal + servicio)", () => {
    // Boleto de $250 MXN: servicio $9.98 + procesamiento $5.20 = $15.18
    expect(eventbriteMxFeeCents(25_000)).toBe(1518);
    expect(eventbriteMxFeeCents(0)).toBe(0);
  });

  it("la tarifa mexicana no depende del número de boletos (no hay cargo fijo)", () => {
    // 4 boletos de $250 pagan lo mismo que 1 de $1,000: no hay fijo por boleto.
    expect(eventbriteMxFeeCents(100_000)).toBe(eventbriteMxFeeCents(25_000 * 4));
  });

  it("la tarifa de EE. UU. sí tiene fijo por boleto (por eso no sirve para México)", () => {
    expect(eventbriteFeeCents(100_000, 4)).toBeGreaterThan(eventbriteFeeCents(100_000, 1));
  });

  it("fmt formatea en pesos por defecto", () => {
    expect(fmt(25_000)).toContain("250");
    expect(fmt(25_000, "usd")).not.toBe(fmt(25_000, "mxn"));
  });
});

/**
 * Invariante del gross-up bajo cargo DIRECTO + OXXO (MXN): tras la comisión de
 * Stripe, lo que queda alcanza para el neto íntegro del organizador + el margen
 * de la plataforma. Es lo que garantiza que el organizador reciba completo y la
 * plataforma no pierda al mover el cobro a la cuenta Connect.
 */
function netAfterStripe(totalCents: number, currency: string): number {
  const proc = processingRate(currency);
  return totalCents - Math.round((totalCents * proc.pct) / 100) - proc.fixed;
}

describe("feeMath — gross-up cubre procesamiento + margen (cargo directo MXN/OXXO)", () => {
  const cases = [
    { subtotal: 100_000, tickets: 1 }, // $1,000 MXN, 1 boleto (caso del cliente Fuente de Vida)
    { subtotal: 250_000, tickets: 5 },
    { subtotal: 50_000, tickets: 2 },
  ];
  for (const c of cases) {
    it(`sub=${c.subtotal} n=${c.tickets}`, () => {
      const fee = ourFeeCents(c.subtotal, c.tickets, "mxn");
      const total = c.subtotal + fee;
      const net = netAfterStripe(total, "mxn");
      const margin = marginCents(c.subtotal, c.tickets, OUR_PERCENT, OUR_FIXED_CENTS);
      expect(net).toBeGreaterThanOrEqual(c.subtotal + margin - 1);
      expect(fee).toBeGreaterThan(0);
    });
  }

  it("incluye extras (passthrough) en el neto del organizador", () => {
    const fee = ourFeeCents(100_000, 1, "mxn", 20_000); // +$200 en extras
    const total = 100_000 + 20_000 + fee;
    const net = netAfterStripe(total, "mxn");
    const margin = marginCents(100_000, 1, OUR_PERCENT, OUR_FIXED_CENTS);
    expect(net).toBeGreaterThanOrEqual(100_000 + 20_000 + margin - 1);
  });
});
