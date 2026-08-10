import { describe, it, expect } from "vitest";
import { generateLayout, parsePrompt, categoryOf } from "./generator";

const base = { widthM: 24, lengthM: 36, heightM: 6, targetCapacity: 300 };
const within = (o: { x: number; y: number; width: number; height: number }, W: number, L: number) =>
  o.x >= -0.01 && o.y >= -0.01 && o.x + o.width <= W + 0.5 && o.y + o.height <= L + 0.5;

describe("generateLayout — el motor no coloca objetos fuera del recinto", () => {
  it("seated: incluye escenario, sillas, acceso y salida; capacidad > 0", () => {
    const l = generateLayout({ ...base, eventType: "Conferencia" });
    const types = l.objects.map((o) => o.type);
    expect(types).toContain("stage");
    expect(types).toContain("chairBlock");
    expect(types).toContain("entrance");
    expect(types).toContain("exit");
    expect(l.metrics.capacity).toBeGreaterThan(0);
    for (const o of l.objects) expect(within(o, l.venue.widthM, l.venue.lengthM)).toBe(true);
  });

  it("banquete: genera mesas redondas", () => {
    const l = generateLayout({ ...base, eventType: "Boda" });
    expect(l.objects.some((o) => o.type === "roundTable")).toBe(true);
  });

  it("expo: genera stands", () => {
    const l = generateLayout({ ...base, eventType: "Expo" });
    expect(l.objects.some((o) => o.type === "sponsorBooth")).toBe(true);
  });

  it("categoryOf clasifica correctamente", () => {
    expect(categoryOf("Boda")).toBe("banquet");
    expect(categoryOf("Expo")).toBe("expo");
    expect(categoryOf("Iglesia")).toBe("seated");
  });

  it("parsePrompt interpreta lenguaje natural", () => {
    const p = parsePrompt("congreso cristiano para 2,500 personas con escenario de 18 metros, dos pantallas LED y zona VIP para 150");
    expect(p.eventType).toBe("Congreso cristiano");
    expect(p.targetCapacity).toBe(2500);
    expect(p.flags.led).toBe(true);
    expect(p.flags.vipCap).toBe(150);
    expect(p.flags.stageW).toBe(18);
  });
});
