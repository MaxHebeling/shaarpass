import { describe, it, expect } from "vitest";
import { resolvePrice, validatePhases, linkSalePhase, type PricePhase } from "./pricing";
import { wallTimeToISO } from "@/lib/datetime";

// Escenario base: preventa $200 (del 1 al 10 nov) → venta $250 (del 10 al 13 nov).
const TZ = "America/Monterrey";
const presaleStart = wallTimeToISO("2026-11-01", "00:00", TZ);
const presaleEnd = wallTimeToISO("2026-11-10", "00:00", TZ);
const saleStart = presaleEnd; // la venta empieza justo al terminar la preventa
const saleEnd = wallTimeToISO("2026-11-13", "19:00", TZ); // inicio del evento

const phases: PricePhase[] = [
  { id: "pre", kind: "presale", priceCents: 20000, startsAt: presaleStart, endsAt: presaleEnd },
  { id: "sal", kind: "sale", priceCents: 25000, startsAt: saleStart, endsAt: saleEnd },
];

const at = (date: string, time: string) => new Date(wallTimeToISO(date, time, TZ));

describe("resolvePrice — ciclo de fases", () => {
  it("antes de empezar la preventa → upcoming (preventa desde)", () => {
    const r = resolvePrice(phases, at("2026-10-20", "12:00"));
    expect(r.status).toBe("upcoming");
    expect(r.purchasable).toBe(false);
    expect(r.priceCents).toBeNull();
    expect(r.nextKind).toBe("presale");
    expect(r.nextStartsAt).toBe(presaleStart);
    expect(r.saleReferenceCents).toBe(25000);
  });

  it("durante la preventa → precio de preventa", () => {
    const r = resolvePrice(phases, at("2026-11-05", "12:00"));
    expect(r.status).toBe("presale");
    expect(r.priceCents).toBe(20000);
    expect(r.phaseId).toBe("pre");
    expect(r.activeUntil).toBe(presaleEnd);
    expect(r.saleReferenceCents).toBe(25000); // para tachar
    expect(r.purchasable).toBe(true);
  });

  it("justo en el cambio de fase (fin preventa = inicio venta) → venta", () => {
    const r = resolvePrice(phases, new Date(Date.parse(presaleEnd)));
    // preventa es [inicio, fin) → en el instante 'fin' ya NO está activa; venta [fin, …) sí.
    expect(r.status).toBe("sale");
    expect(r.priceCents).toBe(25000);
    expect(r.phaseId).toBe("sal");
  });

  it("durante la venta → precio de venta", () => {
    const r = resolvePrice(phases, at("2026-11-11", "12:00"));
    expect(r.status).toBe("sale");
    expect(r.priceCents).toBe(25000);
  });

  it("después del fin de la venta → closed (no comprable)", () => {
    const r = resolvePrice(phases, at("2026-11-20", "12:00"));
    expect(r.status).toBe("closed");
    expect(r.purchasable).toBe(false);
    expect(r.priceCents).toBeNull();
  });
});

describe("resolvePrice — casos sin preventa / sin límites", () => {
  it("una sola fase 'sale' sin fechas = venta abierta (como hoy)", () => {
    const r = resolvePrice([{ id: "s", kind: "sale", priceCents: 30000, startsAt: null, endsAt: null }]);
    expect(r.status).toBe("sale");
    expect(r.priceCents).toBe(30000);
    expect(r.purchasable).toBe(true);
  });

  it("sin fases → closed", () => {
    expect(resolvePrice([]).status).toBe("closed");
  });
});

describe("resolvePrice — zonas horarias distintas (mismo instante)", () => {
  it("el cambio de fase respeta la zona del evento, no la del navegador", () => {
    // Preventa que termina a las 23:59 del 9 nov en Monterrey.
    const pEnd = wallTimeToISO("2026-11-09", "23:59", "America/Monterrey");
    const ph: PricePhase[] = [
      { id: "p", kind: "presale", priceCents: 20000, startsAt: null, endsAt: pEnd },
      { id: "s", kind: "sale", priceCents: 25000, startsAt: pEnd, endsAt: null },
    ];
    // Un minuto antes (hora de Monterrey) sigue siendo preventa…
    expect(resolvePrice(ph, new Date(wallTimeToISO("2026-11-09", "23:58", "America/Monterrey"))).status).toBe("presale");
    // …aunque ese mismo instante en CDMX sea otra hora de pared, el resultado es idéntico (instante absoluto).
    const instante = new Date(Date.parse(pEnd) - 60_000);
    expect(resolvePrice(ph, instante).status).toBe("presale");
    // Un minuto después → venta.
    expect(resolvePrice(ph, new Date(Date.parse(pEnd) + 60_000)).status).toBe("sale");
  });
});

describe("validatePhases", () => {
  it("acepta un ciclo correcto", () => {
    const { errors } = validatePhases(
      [
        { kind: "presale", priceCents: 20000, startsAt: presaleStart, endsAt: presaleEnd },
        { kind: "sale", priceCents: 25000, startsAt: saleStart, endsAt: saleEnd },
      ],
      { eventEndsAt: saleEnd }
    );
    expect(errors).toEqual([]);
  });

  it("detecta fin ≤ inicio", () => {
    const { errors } = validatePhases([{ kind: "sale", priceCents: 100, startsAt: saleEnd, endsAt: saleStart }]);
    expect(errors.some((e) => e.includes("termina antes"))).toBe(true);
  });

  it("detecta traslape entre preventa y venta", () => {
    const { errors } = validatePhases([
      { kind: "presale", priceCents: 200, startsAt: presaleStart, endsAt: saleEnd },
      { kind: "sale", priceCents: 250, startsAt: presaleEnd, endsAt: saleEnd },
    ]);
    expect(errors.some((e) => e.includes("traslapan"))).toBe(true);
  });

  it("detecta venta que termina después del fin del evento", () => {
    const afterEvent = wallTimeToISO("2026-11-14", "12:00", TZ);
    const { errors } = validatePhases(
      [{ kind: "sale", priceCents: 250, startsAt: saleStart, endsAt: afterEvent }],
      { eventEndsAt: saleEnd }
    );
    expect(errors.some((e) => e.includes("fin del evento"))).toBe(true);
  });

  it("advierte (sin bloquear) si la preventa ≥ venta", () => {
    const { errors, warnings } = validatePhases([
      { kind: "presale", priceCents: 25000, startsAt: presaleStart, endsAt: presaleEnd },
      { kind: "sale", priceCents: 25000, startsAt: saleStart, endsAt: saleEnd },
    ]);
    expect(errors).toEqual([]);
    expect(warnings.length).toBe(1);
  });

  it("rechaza precio negativo", () => {
    const { errors } = validatePhases([{ kind: "sale", priceCents: -1, startsAt: null, endsAt: null }]);
    expect(errors.some((e) => e.includes("mayor o igual a 0"))).toBe(true);
  });
});

// ─── venta enlazada a la preventa (bug "Venta → Inicia" no persistía) ─────────

describe("linkSalePhase + transición de precio", () => {
  const MTY = "America/Monterrey";
  const presaleEnd = wallTimeToISO("2026-11-01", "00:00", MTY); // la venta debe arrancar aquí

  it("venta sin inicio → arranca al terminar la preventa", () => {
    const linked = linkSalePhase([
      { kind: "presale", priceCents: 20000, startsAt: wallTimeToISO("2026-10-01", "00:00", MTY), endsAt: presaleEnd },
      { kind: "sale", priceCents: 25000, startsAt: null, endsAt: null },
    ]);
    const sale = linked.find((p) => p.kind === "sale")!;
    expect(sale.startsAt).toBe(presaleEnd);
  });

  it("el precio vigente cambia a $250 el 01/11 00:00 (zona del evento)", () => {
    const phases: PricePhase[] = linkSalePhase([
      { kind: "presale", priceCents: 20000, startsAt: wallTimeToISO("2026-10-01", "00:00", MTY), endsAt: presaleEnd },
      { kind: "sale", priceCents: 25000, startsAt: null, endsAt: wallTimeToISO("2026-11-13", "19:00", MTY) },
    ]).map((p) => ({ id: p.kind, ...p }));

    // 31/10 23:59 Monterrey → preventa $200
    expect(resolvePrice(phases, new Date(wallTimeToISO("2026-10-31", "23:59", MTY)))).toMatchObject({ status: "presale", priceCents: 20000 });
    // 01/11 00:00 Monterrey exacto → venta $250
    expect(resolvePrice(phases, new Date(presaleEnd))).toMatchObject({ status: "sale", priceCents: 25000 });
    // 01/11 00:01 Monterrey → venta $250
    expect(resolvePrice(phases, new Date(wallTimeToISO("2026-11-01", "00:01", MTY)))).toMatchObject({ status: "sale", priceCents: 25000 });
  });

  it("si la venta queda sin inicio (bug), NO opaca a la preventa activa", () => {
    // Sin enlazar: venta con inicio null = 'siempre activa'. El tie-break por fin
    // más cercano hace que la preventa (acotada) gane durante su ventana.
    const phases: PricePhase[] = [
      { id: "pre", kind: "presale", priceCents: 20000, startsAt: wallTimeToISO("2026-10-01", "00:00", MTY), endsAt: presaleEnd },
      { id: "sal", kind: "sale", priceCents: 25000, startsAt: null, endsAt: null },
    ];
    expect(resolvePrice(phases, new Date(wallTimeToISO("2026-10-15", "12:00", MTY))).priceCents).toBe(20000);
  });
});
