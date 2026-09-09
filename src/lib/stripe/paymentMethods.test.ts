import { describe, it, expect } from "vitest";
import {
  paymentMethodsFor,
  paymentMethodOptions,
  isAsyncMethod,
  OXXO_MIN_CENTS,
  OXXO_MAX_CENTS,
  OXXO_EXPIRES_AFTER_DAYS,
} from "./paymentMethods";

describe("paymentMethodsFor", () => {
  it("ofrece OXXO en MXN dentro del rango de la ficha", () => {
    expect(paymentMethodsFor("mxn", 108000)).toEqual(["card", "oxxo"]);
    expect(paymentMethodsFor("MXN", OXXO_MIN_CENTS)).toEqual(["card", "oxxo"]);
    expect(paymentMethodsFor("mxn", OXXO_MAX_CENTS)).toEqual(["card", "oxxo"]);
  });

  it("NO ofrece OXXO fuera del rango de la ficha", () => {
    expect(paymentMethodsFor("mxn", OXXO_MIN_CENTS - 1)).toEqual(["card"]);
    expect(paymentMethodsFor("mxn", OXXO_MAX_CENTS + 1)).toEqual(["card"]);
  });

  it("solo tarjeta en monedas != MXN", () => {
    expect(paymentMethodsFor("usd", 5000)).toEqual(["card"]);
    expect(paymentMethodsFor("eur", 5000)).toEqual(["card"]);
  });
});

describe("paymentMethodOptions", () => {
  it("fija los días de vencimiento de la ficha OXXO", () => {
    expect(paymentMethodOptions(["card", "oxxo"])).toEqual({ oxxo: { expires_after_days: OXXO_EXPIRES_AFTER_DAYS } });
  });
  it("sin opciones cuando no hay OXXO", () => {
    expect(paymentMethodOptions(["card"])).toBeUndefined();
  });
});

describe("isAsyncMethod", () => {
  it("oxxo/spei son async; card no", () => {
    expect(isAsyncMethod("oxxo")).toBe(true);
    expect(isAsyncMethod("spei")).toBe(true);
    expect(isAsyncMethod("card")).toBe(false);
    expect(isAsyncMethod(null)).toBe(false);
    expect(isAsyncMethod(undefined)).toBe(false);
  });
});
