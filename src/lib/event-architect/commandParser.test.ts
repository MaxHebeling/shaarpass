import { describe, it, expect } from "vitest";
import { parseCommand } from "./commandParser";
import type { Venue } from "./types";

const venue: Venue = { widthM: 20, lengthM: 30, heightM: 4, shape: "Rectangular", eventType: "Conferencia" };

describe("commandParser — comandos IA locales", () => {
  it("agrega una librería", () => {
    const r = parseCommand("agrega una librería", [], venue);
    expect(r.objects.length).toBe(1);
    expect(r.objects[0].type).toBe("bookstore");
  });

  it("zona VIP para 100 con capacidad", () => {
    const r = parseCommand("quiero una zona VIP para 100 personas", [], venue);
    const vip = r.objects.find((o) => o.type === "vipArea")!;
    expect(vip.capacityImpact).toBe(100);
  });

  it("N mesas de registro", () => {
    const r = parseCommand("agrega 4 mesas de registro", [], venue);
    expect(r.objects.filter((o) => o.type === "registrationTable").length).toBe(4);
  });

  it("comando desconocido devuelve ayuda sin romper", () => {
    const r = parseCommand("blablabla", [], venue);
    expect(r.objects.length).toBe(0);
    expect(r.message.toLowerCase()).toContain("no entendí");
  });
});
