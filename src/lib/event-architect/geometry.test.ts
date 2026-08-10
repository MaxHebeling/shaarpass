import { describe, it, expect } from "vitest";
import { aabbOverlap, clampToVenue, blockCapacity, chairBlock } from "./geometry";
import type { VenueObject, Venue } from "./types";

const mk = (x: number, y: number, w = 2, h = 2): VenueObject => ({ id: "t", type: "backstage", label: "x", x, y, width: w, height: h, rotation: 0, capacityImpact: 0 });
const venue: Venue = { widthM: 20, lengthM: 30, heightM: 4, shape: "Rectangular", eventType: "Conferencia" };

describe("geometry", () => {
  it("aabbOverlap detecta solapamiento", () => {
    expect(aabbOverlap(mk(0, 0), mk(1, 1))).toBe(true);
    expect(aabbOverlap(mk(0, 0), mk(5, 5))).toBe(false);
  });

  it("clampToVenue mantiene el objeto dentro del recinto", () => {
    const c = clampToVenue(mk(100, 100, 3, 3), venue);
    expect(c.x + c.width).toBeLessThanOrEqual(venue.widthM);
    expect(c.y + c.height).toBeLessThanOrEqual(venue.lengthM);
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.y).toBeGreaterThanOrEqual(0);
  });

  it("blockCapacity = filas × columnas", () => {
    const b = chairBlock(0, 0, 10, 5);
    expect(blockCapacity(b)).toBe(50);
    expect(b.capacityImpact).toBe(50);
  });
});
