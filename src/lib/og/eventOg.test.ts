import { describe, it, expect } from "vitest";
import { ogTitleDesc, ogDateLabel, ogPlaceLabel, ogVersion, type OgEvent } from "./eventOg";

const base: OgEvent = {
  slug: "mi-evento",
  title: "Noche de Adoración",
  description: null,
  coverImage: "https://cdn/cover.jpg",
  city: "Monterrey",
  region: "NL",
  venueName: "Auditorio",
  category: "concierto",
  orgName: "Producciones Aurora",
  orgLogo: "https://cdn/logoA.png",
  brandColor: "#d6219b",
  whiteLabel: false,
  isOnline: false,
  status: "published",
  firstDay: "2026-11-13",
  lastDay: "2026-11-14",
};

describe("ogTitleDesc", () => {
  it("usa la descripción del evento si existe (normalizada y recortada a 160)", () => {
    const { description } = ogTitleDesc({ ...base, description: "  Una   noche   especial.  " });
    expect(description).toBe("Una noche especial.");
  });
  it("genera descripción de fallback sin inventar datos", () => {
    const { description } = ogTitleDesc(base);
    expect(description).toContain("Noche de Adoración");
    expect(description).toContain("Monterrey");
    expect(description.length).toBeLessThanOrEqual(160);
  });
  it("título incluye lugar + marca y se recorta a 110", () => {
    const { title } = ogTitleDesc(base);
    expect(title).toBe("Noche de Adoración · Monterrey, NL | ShaarPass");
    const long = ogTitleDesc({ ...base, title: "x".repeat(200) });
    expect(long.title.length).toBeLessThanOrEqual(110);
  });
  it("white-label usa la marca del organizador, no ShaarPass", () => {
    const { title } = ogTitleDesc({ ...base, whiteLabel: true });
    expect(title).toContain("Producciones Aurora");
    expect(title).not.toContain("ShaarPass");
  });
});

describe("ogDateLabel / ogPlaceLabel", () => {
  it("rango de fechas", () => expect(ogDateLabel(base)).toBe("13–14 nov 2026"));
  it("un solo día", () => expect(ogDateLabel({ ...base, lastDay: "2026-11-13" })).toBe("13 nov 2026"));
  it("presencial: venue · ciudad", () => expect(ogPlaceLabel(base)).toBe("Auditorio · Monterrey · NL"));
  it("en línea", () => expect(ogPlaceLabel({ ...base, isOnline: true })).toBe("Evento en línea"));
});

describe("ogVersion (cache-busting)", () => {
  it("es estable para el mismo contenido", () => {
    expect(ogVersion(base)).toBe(ogVersion({ ...base }));
  });
  it("cambia si cambia el título, la portada, la fecha o el estado", () => {
    const v = ogVersion(base);
    expect(ogVersion({ ...base, title: "Otro" })).not.toBe(v);
    expect(ogVersion({ ...base, coverImage: "https://cdn/otra.jpg" })).not.toBe(v);
    expect(ogVersion({ ...base, firstDay: "2026-11-10" })).not.toBe(v);
    expect(ogVersion({ ...base, status: "cancelled" })).not.toBe(v);
  });
  it("aislamiento: logo/marca distintos → versión distinta (otra organización)", () => {
    expect(ogVersion({ ...base, orgLogo: "https://cdn/logoB.png" })).not.toBe(ogVersion(base));
    expect(ogVersion({ ...base, brandColor: "#00aaff" })).not.toBe(ogVersion(base));
  });
});
