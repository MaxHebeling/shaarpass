import { describe, it, expect } from "vitest";
import { wallTimeToISO, isoToWallParts } from "./datetime";

describe("datetime — hora de pared ↔ UTC por zona", () => {
  it("ida y vuelta preserva fecha y hora local", () => {
    const tz = "America/Argentina/Salta";
    const iso = wallTimeToISO("2026-07-11", "17:00", tz);
    const back = isoToWallParts(iso, tz);
    expect(back.date).toBe("2026-07-11");
    expect(back.time).toBe("17:00");
  });

  it("misma hora de pared en zonas distintas da UTC distinto", () => {
    const a = wallTimeToISO("2026-07-11", "17:00", "America/Mexico_City");
    const b = wallTimeToISO("2026-07-11", "17:00", "America/Argentina/Salta");
    expect(a).not.toBe(b);
  });
});
