/** Matemática de fees compartida (cliente + marketing). Pura, sin env. */

export const OUR_PERCENT = 2.0;
export const OUR_FIXED_CENTS = 50;

/** Nuestra comisión: 2% + $0.50 por boleto. Eventos gratis = $0. */
export function ourFeeCents(subtotalCents: number, ticketCount: number): number {
  if (subtotalCents <= 0) return 0;
  return Math.round((subtotalCents * OUR_PERCENT) / 100) + OUR_FIXED_CENTS * ticketCount;
}

/**
 * Comisión de Eventbrite (US, plan Flex):
 * service 3.7% + $1.79/boleto, + processing 2.9% sobre (subtotal + service).
 */
export function eventbriteFeeCents(subtotalCents: number, ticketCount: number): number {
  if (subtotalCents <= 0) return 0;
  const service = Math.round(subtotalCents * 0.037) + 179 * ticketCount;
  const processing = Math.round((subtotalCents + service) * 0.029);
  return service + processing;
}

export const fmt = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
