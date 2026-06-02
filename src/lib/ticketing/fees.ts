/**
 * Fees de plataforma — DIFERENCIADOR #1: bajos y transparentes.
 * Una sola fuente de verdad (comparte matemática con el cliente vía feeMath).
 *
 * La comisión al comprador = margen de plataforma (2% + $0.50/boleto) + el costo
 * de procesamiento de Stripe trasladado (gross-up). Así la plataforma SIEMPRE
 * netea su margen y el organizador recibe su neto íntegro; nunca se pierde dinero.
 */
import { ourFeeCents, marginCents } from "./feeMath";

const PERCENT = Number(process.env.PLATFORM_FEE_PERCENT ?? "2.0");
const FIXED_CENTS = Number(process.env.PLATFORM_FEE_FIXED_CENTS ?? "50");

export interface FeeBreakdown {
  subtotalCents: number;      // boletos (al organizador)
  passthroughCents: number;   // extras/servicios (al organizador, sin margen)
  marginCents: number;        // margen NETO de la plataforma
  processingCents: number;    // costo de Stripe recuperado (aprox)
  platformFeeCents: number;   // comisión mostrada al comprador (= application_fee)
  totalCents: number;         // lo que paga el comprador
  percent: number;
  fixedCentsPerTicket: number;
}

/**
 * @param subtotalCents   suma de (precio * cantidad) de los boletos (post-descuento)
 * @param ticketCount     nº de boletos (el fijo es por boleto)
 * @param currency        moneda del evento (define el costo de procesamiento)
 * @param passthroughCents extras (servicios) que van al organizador sin margen
 */
export function computeFees(subtotalCents: number, ticketCount: number, currency = "usd", passthroughCents = 0): FeeBreakdown {
  const organizerNet = Math.max(0, subtotalCents) + Math.max(0, passthroughCents);
  const m = marginCents(subtotalCents, ticketCount, PERCENT, FIXED_CENTS);
  const base = { subtotalCents, passthroughCents, percent: PERCENT, fixedCentsPerTicket: FIXED_CENTS };
  if (organizerNet <= 0) {
    return { ...base, marginCents: 0, processingCents: 0, platformFeeCents: 0, totalCents: 0 };
  }
  const platformFeeCents = ourFeeCents(subtotalCents, ticketCount, currency, passthroughCents, PERCENT, FIXED_CENTS);
  return {
    ...base,
    marginCents: m,
    processingCents: Math.max(0, platformFeeCents - m),
    platformFeeCents,
    totalCents: organizerNet + platformFeeCents,
  };
}
