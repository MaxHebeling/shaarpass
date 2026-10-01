import { describe, it, expect } from "vitest";
import { formatDayRange } from "./datetime";

describe("formatDayRange", () => {
  it("un solo día", () => expect(formatDayRange("2026-11-13", "2026-11-13")).toBe("13 nov 2026"));
  it("mismo mes", () => expect(formatDayRange("2026-11-13", "2026-11-14")).toBe("13–14 nov 2026"));
  it("meses distintos, mismo año", () => expect(formatDayRange("2026-11-30", "2026-12-02")).toBe("30 nov – 2 dic 2026"));
  it("años distintos", () => expect(formatDayRange("2026-12-30", "2027-01-02")).toBe("30 dic 2026 – 2 ene 2027"));
  it("last vacío = single", () => expect(formatDayRange("2026-11-13", "")).toBe("13 nov 2026"));
});
