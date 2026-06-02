/**
 * Fees de plataforma — DIFERENCIADOR #1: bajos y transparentes.
 * Una sola fuente de verdad; se muestra al organizador y al comprador.
 */
const PERCENT = Number(process.env.PLATFORM_FEE_PERCENT ?? "2.0");
const FIXED_CENTS = Number(process.env.PLATFORM_FEE_FIXED_CENTS ?? "50");

export interface FeeBreakdown {
  subtotalCents: number;
  platformFeeCents: number;
  totalCents: number;
  percent: number;
  fixedCentsPerTicket: number;
}

/**
 * @param subtotalCents suma de (precio * cantidad) de todos los items
 * @param ticketCount   nº total de boletos (el fijo se cobra por boleto)
 */
export function computeFees(subtotalCents: number, ticketCount: number): FeeBreakdown {
  // Eventos gratis = sin fee (como Eventbrite, pero sin letra chica).
  if (subtotalCents <= 0) {
    return { subtotalCents, platformFeeCents: 0, totalCents: 0, percent: PERCENT, fixedCentsPerTicket: FIXED_CENTS };
  }
  const variable = Math.round((subtotalCents * PERCENT) / 100);
  const fixed = FIXED_CENTS * ticketCount;
  const platformFeeCents = variable + fixed;
  return {
    subtotalCents,
    platformFeeCents,
    totalCents: subtotalCents + platformFeeCents,
    percent: PERCENT,
    fixedCentsPerTicket: FIXED_CENTS,
  };
}
