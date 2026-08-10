import { describe, it, expect } from "vitest";
import { ourFeeCents, resaleBuyerTotal, processingRate } from "./feeMath";

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
});
