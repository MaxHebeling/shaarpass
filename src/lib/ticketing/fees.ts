/**
 * Fees de plataforma — DIFERENCIADOR #1: bajos y transparentes.
 * Una sola fuente de verdad (comparte matemática con el cliente vía feeMath).
 *
 * DOS MODELOS de comisión (por organizador, ver organizations.absorb_fees):
 *
 *  - "passed" (por defecto): el COMPRADOR paga la comisión aparte. Comisión al
 *    comprador = margen de plataforma (2% + $0.50/boleto) + procesamiento de Stripe
 *    trasladado (gross-up). El organizador recibe su neto íntegro.
 *
 *  - "absorbed": el COMPRADOR paga el precio de lista exacto; el ORGANIZADOR absorbe
 *    las comisiones (Stripe + margen de plataforma). El comprador no ve fee añadido.
 *
 * En CARGO DIRECTO, Stripe le cobra su comisión a la cuenta del organizador; la
 * plataforma cobra por separado `application_fee_amount` = SU MARGEN (marginCents).
 * Por eso `applicationFeeCents` es el margen, no el fee con gross-up (ese gross-up,
 * en el modo passed, es lo que el comprador paga de más para cubrir a Stripe, que
 * se lo descuenta a la cuenta del organizador).
 */
import { ourFeeCents, marginCents } from "./feeMath";

const PERCENT = Number(process.env.PLATFORM_FEE_PERCENT ?? "2.0");
const FIXED_CENTS = Number(process.env.PLATFORM_FEE_FIXED_CENTS ?? "50");

export interface FeeBreakdown {
  subtotalCents: number;      // boletos (al organizador)
  passthroughCents: number;   // extras/servicios (al organizador, sin margen)
  marginCents: number;        // margen NETO de la plataforma
  processingCents: number;    // costo de Stripe recuperado del comprador (solo modo passed)
  platformFeeCents: number;   // comisión AÑADIDA al comprador (0 en modo absorbed)
  applicationFeeCents: number;// lo que cobra la plataforma vía Stripe (= margen, en cargo directo)
  totalCents: number;         // lo que paga el comprador
  absorbFees: boolean;        // modelo aplicado
  percent: number;
  fixedCentsPerTicket: number;
}

/**
 * @param subtotalCents   suma de (precio * cantidad) de los boletos (post-descuento)
 * @param ticketCount     nº de boletos (el fijo es por boleto)
 * @param currency        moneda del evento (define el costo de procesamiento)
 * @param passthroughCents extras (servicios) que van al organizador sin margen
 * @param absorbFees      true = el organizador absorbe las comisiones (comprador paga precio de lista)
 */
export function computeFees(subtotalCents: number, ticketCount: number, currency = "usd", passthroughCents = 0, absorbFees = false): FeeBreakdown {
  const organizerNet = Math.max(0, subtotalCents) + Math.max(0, passthroughCents);
  const m = marginCents(subtotalCents, ticketCount, PERCENT, FIXED_CENTS);
  const base = { subtotalCents, passthroughCents, absorbFees, percent: PERCENT, fixedCentsPerTicket: FIXED_CENTS };
  if (organizerNet <= 0) {
    return { ...base, marginCents: 0, processingCents: 0, platformFeeCents: 0, applicationFeeCents: 0, totalCents: 0 };
  }
  if (absorbFees) {
    // El comprador paga el precio de lista; la plataforma cobra su margen vía
    // application_fee; Stripe le descuenta lo suyo a la cuenta del organizador.
    return {
      ...base,
      marginCents: m,
      processingCents: 0,
      platformFeeCents: 0,
      applicationFeeCents: m,
      totalCents: organizerNet,
    };
  }
  // Modo "passed": el comprador cubre la comisión (margen + procesamiento con gross-up).
  const platformFeeCents = ourFeeCents(subtotalCents, ticketCount, currency, passthroughCents, PERCENT, FIXED_CENTS);
  return {
    ...base,
    marginCents: m,
    processingCents: Math.max(0, platformFeeCents - m),
    platformFeeCents,
    applicationFeeCents: m, // en cargo directo la plataforma solo cobra su margen
    totalCents: organizerNet + platformFeeCents,
  };
}
