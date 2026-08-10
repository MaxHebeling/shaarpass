import { describe, it, expect } from "vitest";
import { capacityMatrix } from "./capacity";

describe("capacityMatrix", () => {
  it("devuelve aforos positivos por tipo", () => {
    const rows = capacityMatrix(600);
    expect(rows.length).toBeGreaterThan(5);
    for (const r of rows) expect(r.people).toBeGreaterThanOrEqual(0);
  });

  it("banquete cabe menos gente que teatro (más m² por persona)", () => {
    const rows = capacityMatrix(600);
    const banquet = rows.find((r) => r.key === "banquet")!.people;
    const theater = rows.find((r) => r.key === "theater")!.people;
    expect(banquet).toBeLessThan(theater);
  });

  it("más área → más capacidad", () => {
    const small = capacityMatrix(200).find((r) => r.key === "theater")!.people;
    const big = capacityMatrix(1000).find((r) => r.key === "theater")!.people;
    expect(big).toBeGreaterThan(small);
  });
});
