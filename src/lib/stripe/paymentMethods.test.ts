import { describe, it, expect } from "vitest";
import {
  paymentMethodsFor,
  paymentMethodOptions,
  requiresCustomer,
  isAsyncMethod,
  OXXO_MIN_CENTS,
  OXXO_MAX_CENTS,
  OXXO_EXPIRES_AFTER_DAYS,
} from "./paymentMethods";

const ALL = { oxxo: true, spei: true };
const NONE = { oxxo: false, spei: false };

describe("paymentMethodsFor — gating por capability", () => {
  it("ofrece OXXO en MXN dentro del rango SOLO si la capability oxxo está activa", () => {
    expect(paymentMethodsFor("mxn", 108000, { oxxo: true, spei: false })).toEqual(["card", "oxxo"]);
    expect(paymentMethodsFor("MXN", OXXO_MIN_CENTS, ALL)).toContain("oxxo");
    // Sin capability, NO se ofrece (evita romper el PI en la cuenta conectada).
    expect(paymentMethodsFor("mxn", 108000, NONE)).toEqual(["card"]);
    expect(paymentMethodsFor("mxn", 108000)).toEqual(["card"]); // default sin caps
  });

  it("ofrece SPEI (customer_balance) en MXN solo si la capability spei está activa", () => {
    expect(paymentMethodsFor("mxn", 108000, { oxxo: false, spei: true })).toEqual(["card", "customer_balance"]);
    expect(paymentMethodsFor("mxn", 108000, ALL)).toEqual(["card", "oxxo", "customer_balance"]);
  });

  it("NO ofrece OXXO fuera del rango de la ficha (aunque tenga capability)", () => {
    expect(paymentMethodsFor("mxn", OXXO_MIN_CENTS - 1, ALL)).not.toContain("oxxo");
    expect(paymentMethodsFor("mxn", OXXO_MAX_CENTS + 1, ALL)).not.toContain("oxxo");
    // Pero SPEI (sin tope) sí sigue disponible para montos altos.
    expect(paymentMethodsFor("mxn", OXXO_MAX_CENTS + 1, ALL)).toContain("customer_balance");
  });

  it("solo tarjeta en monedas != MXN, aunque tenga capabilities", () => {
    expect(paymentMethodsFor("usd", 5000, ALL)).toEqual(["card"]);
    expect(paymentMethodsFor("eur", 5000, ALL)).toEqual(["card"]);
  });
});

describe("paymentMethodOptions", () => {
  it("fija OXXO y SPEI cuando aplican", () => {
    expect(paymentMethodOptions(["card", "oxxo"])).toEqual({ oxxo: { expires_after_days: OXXO_EXPIRES_AFTER_DAYS } });
    expect(paymentMethodOptions(["card", "customer_balance"])).toEqual({
      customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "mx_bank_transfer", requested_address_types: ["spei"] } },
    });
    expect(paymentMethodOptions(["card"])).toBeUndefined();
  });
});

describe("requiresCustomer", () => {
  it("customer_balance (SPEI) requiere Customer; card/oxxo no", () => {
    expect(requiresCustomer(["card", "customer_balance"])).toBe(true);
    expect(requiresCustomer(["card", "oxxo"])).toBe(false);
    expect(requiresCustomer(["card"])).toBe(false);
  });
});

describe("isAsyncMethod", () => {
  it("oxxo/spei/customer_balance son async; card no", () => {
    expect(isAsyncMethod("oxxo")).toBe(true);
    expect(isAsyncMethod("spei")).toBe(true);
    expect(isAsyncMethod("customer_balance")).toBe(true);
    expect(isAsyncMethod("card")).toBe(false);
    expect(isAsyncMethod(null)).toBe(false);
  });
});
