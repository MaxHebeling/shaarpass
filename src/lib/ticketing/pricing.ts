/**
 * Fases de precio (preventa / venta) por tipo de boleto.
 *
 * FUENTE ÚNICA de la verdad del precio vigente: se usa en el servidor (checkout),
 * en la página pública y en el dashboard. El precio NUNCA se toma del navegador.
 *
 * Reglas:
 *  - Una fase está activa si  (inicio es null || ahora >= inicio) && (fin es null || ahora < fin).
 *  - Si hay una fase activa → ese es el precio vigente (preventa o venta).
 *  - Si no hay activa pero sí una futura → "upcoming" (Próximamente / Preventa desde…).
 *  - Si todas terminaron → "closed" (Venta cerrada).
 *  - Inventario COMPARTIDO entre fases (vive en ticket_types.quantity_total).
 */

export type PhaseKind = "presale" | "sale";
export type SaleStatus = "presale" | "sale" | "upcoming" | "closed";

export interface PricePhase {
  id: string;
  kind: PhaseKind;
  priceCents: number;
  startsAt: string | null; // ISO (instante absoluto) o null = sin límite
  endsAt: string | null;
}

export interface ResolvedPrice {
  status: SaleStatus;
  priceCents: number | null; // vigente; null si no se puede comprar
  phaseId: string | null;
  phaseKind: PhaseKind | null;
  activeUntil: string | null; // fin de la fase vigente (para cuenta regresiva)
  nextStartsAt: string | null; // inicio de la próxima fase (si upcoming)
  nextKind: PhaseKind | null;
  saleReferenceCents: number | null; // precio de la fase 'sale' (tachado en preventa)
  purchasable: boolean;
}

const ms = (iso: string | null): number | null => (iso ? Date.parse(iso) : null);

function isActive(p: PricePhase, now: number): boolean {
  const s = ms(p.startsAt);
  const e = ms(p.endsAt);
  return (s === null || now >= s) && (e === null || now < e);
}

export function resolvePrice(phases: PricePhase[], now: Date = new Date()): ResolvedPrice {
  const t = now.getTime();
  const sale = phases.find((p) => p.kind === "sale") ?? null;
  const saleRef = sale ? sale.priceCents : null;
  const closed: ResolvedPrice = {
    status: "closed",
    priceCents: null,
    phaseId: null,
    phaseKind: null,
    activeUntil: null,
    nextStartsAt: null,
    nextKind: null,
    saleReferenceCents: saleRef,
    purchasable: false,
  };
  if (!phases.length) return closed;

  // Fase activa (a lo sumo una si no se traslapan; si hay varias, la de inicio más temprano).
  const active = phases
    .filter((p) => isActive(p, t))
    .sort((a, b) => (ms(a.startsAt) ?? -Infinity) - (ms(b.startsAt) ?? -Infinity))[0];
  if (active) {
    return {
      status: active.kind,
      priceCents: active.priceCents,
      phaseId: active.id,
      phaseKind: active.kind,
      activeUntil: active.endsAt,
      nextStartsAt: null,
      nextKind: null,
      saleReferenceCents: saleRef,
      purchasable: true,
    };
  }

  // Sin fase activa: ¿hay una futura?
  const future = phases
    .filter((p) => {
      const s = ms(p.startsAt);
      return s !== null && s > t;
    })
    .sort((a, b) => ms(a.startsAt)! - ms(b.startsAt)!)[0];
  if (future) {
    return {
      status: "upcoming",
      priceCents: null,
      phaseId: null,
      phaseKind: null,
      activeUntil: null,
      nextStartsAt: future.startsAt,
      nextKind: future.kind,
      saleReferenceCents: saleRef,
      purchasable: false,
    };
  }
  return closed;
}

// ---------------------------------------------------------------------------
// Validación (compartida por el editor y las server actions).
// ---------------------------------------------------------------------------
export interface PhaseInput {
  kind: PhaseKind;
  priceCents: number;
  startsAt: string | null;
  endsAt: string | null;
}

export function validatePhases(
  phases: PhaseInput[],
  opts?: { eventEndsAt?: string | null }
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nombre = (k: PhaseKind) => (k === "presale" ? "preventa" : "venta");

  for (const p of phases) {
    if (!Number.isFinite(p.priceCents) || p.priceCents < 0) {
      errors.push(`El precio de ${nombre(p.kind)} debe ser mayor o igual a 0.`);
    }
    const s = ms(p.startsAt);
    const e = ms(p.endsAt);
    if (s !== null && e !== null && e <= s) {
      errors.push(`La ${nombre(p.kind)} termina antes (o al mismo tiempo) de empezar.`);
    }
  }

  // No traslape: ordenadas por inicio, cada fin ≤ el inicio siguiente.
  const bounded = phases
    .map((p) => ({ s: ms(p.startsAt), e: ms(p.endsAt) }))
    .sort((a, b) => (a.s ?? -Infinity) - (b.s ?? -Infinity));
  for (let i = 1; i < bounded.length; i++) {
    const prevEnd = bounded[i - 1].e ?? Infinity;
    const curStart = bounded[i].s ?? -Infinity;
    if (curStart < prevEnd) {
      errors.push("Las fases de preventa y venta se traslapan.");
      break;
    }
  }

  // La venta no termina después del fin del evento.
  const evEnd = ms(opts?.eventEndsAt ?? null);
  if (evEnd !== null) {
    for (const p of phases) {
      const e = ms(p.endsAt);
      if (e !== null && e > evEnd) {
        errors.push("La venta no puede terminar después del fin del evento.");
        break;
      }
    }
  }

  // Advertencia (no bloquea): preventa ≥ venta.
  const pre = phases.find((p) => p.kind === "presale");
  const sale = phases.find((p) => p.kind === "sale");
  if (pre && sale && pre.priceCents >= sale.priceCents) {
    warnings.push("El precio de preventa es mayor o igual al de venta.");
  }

  return { errors, warnings };
}
