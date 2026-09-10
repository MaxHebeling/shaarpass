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

  it("cargo directo: application_fee = MARGEN (no el fee con gross-up)", () => {
    // En cargo directo Stripe le cobra su comisión a la cuenta del organizador;
    // la plataforma solo cobra su margen vía application_fee_amount.
    const f = computeFees(100000, 1, "mxn");
    expect(f.applicationFeeCents).toBe(f.marginCents);
    expect(f.applicationFeeCents).toBeLessThan(f.platformFeeCents); // el fee al comprador incluye procesamiento
  });
});

describe("computeFees — modo absorbido (organizador absorbe comisiones)", () => {
  it("el comprador paga el precio de lista exacto (sin fee añadido)", () => {
    const f = computeFees(100000, 1, "mxn", 0, true);
    expect(f.totalCents).toBe(100000);      // comprador paga $1,000 exactos
    expect(f.platformFeeCents).toBe(0);      // no se añade fee al comprador
    expect(f.absorbFees).toBe(true);
  });

  it("la plataforma sigue cobrando su margen vía application_fee", () => {
    const f = computeFees(100000, 1, "mxn", 0, true);
    expect(f.applicationFeeCents).toBe(f.marginCents);
    expect(f.marginCents).toBe(2050); // 2% de 100000 + 50 = 2050
  });

  it("incluye extras en el precio de lista (comprador paga face de boletos + extras)", () => {
    const f = computeFees(100000, 1, "mxn", 20000, true);
    expect(f.totalCents).toBe(120000);
  });

  it("evento gratis en modo absorbido = todo en cero", () => {
    const f = computeFees(0, 2, "mxn", 0, true);
    expect(f.totalCents).toBe(0);
    expect(f.applicationFeeCents).toBe(0);
  });
});
