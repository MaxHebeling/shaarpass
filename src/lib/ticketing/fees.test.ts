import { describe, it, expect } from "vitest";
import { computeFees } from "./fees";

// Invariantes de negocio del desglose que ve el comprador y define el application_fee.
describe("computeFees — invariantes del cobro", () => {
  it("evento gratis → todo en cero", () => {
    const f = computeFees(0, 1, "mxn");
    expect(f.totalCents).toBe(0);
    expect(f.platformFeeCents).toBe(0);
    expect(f.marginCents).toBe(0);
    expect(f.processingCents).toBe(0);
  });

  it("total = neto del organizador + comisión (nunca descuadra)", () => {
    for (const [sub, cnt, cur, pass] of [[25000, 1, "mxn", 0], [50000, 3, "usd", 0], [25000, 1, "mxn", 5000]] as const) {
      const f = computeFees(sub, cnt, cur, pass);
      expect(f.totalCents).toBe(sub + pass + f.platformFeeCents);
    }
  });

  it("el procesamiento recuperado nunca es negativo (la plataforma no subsidia a Stripe)", () => {
    for (const cur of ["mxn", "usd", "eur", "brl"]) {
      const f = computeFees(50000, 2, cur);
      expect(f.processingCents).toBeGreaterThanOrEqual(0);
      expect(f.platformFeeCents).toBeGreaterThanOrEqual(f.marginCents);
    }
  });

  it("boleto de 250 MXN: margen neto de plataforma = $5.50 (2% + $0.50)", () => {
    const f = computeFees(25000, 1, "mxn");
    expect(f.marginCents).toBe(550);
    // El comprador paga la comisión encima; el organizador recibe su neto íntegro.
    expect(f.totalCents).toBe(25000 + f.platformFeeCents);
  });

  it("los extras (passthrough) van al organizador sin margen adicional", () => {
    const sinExtra = computeFees(25000, 1, "mxn", 0);
    const conExtra = computeFees(25000, 1, "mxn", 5000);
    // El margen de plataforma no cambia por los extras.
    expect(conExtra.marginCents).toBe(sinExtra.marginCents);
    // Pero el organizador recibe los extras completos.
    expect(conExtra.totalCents).toBeGreaterThanOrEqual(sinExtra.totalCents + 5000);
  });
});
