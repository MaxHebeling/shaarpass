import { describe, it, expect } from "vitest";
import { money } from "./money";

describe("money — formateo de centavos", () => {
  it("formatea a 2 decimales", () => {
    expect(money(12345, "mxn")).toContain("123.45");
    expect(money(100, "usd")).toContain("1.00");
  });

  it("moneda inválida no rompe: cae al fallback legible", () => {
    const s = money(100, "zzz");
    expect(s).toContain("1.00");
    expect(s.toUpperCase()).toContain("ZZZ");
  });

  it("cero se formatea sin lanzar", () => {
    expect(() => money(0, "mxn")).not.toThrow();
  });
});
