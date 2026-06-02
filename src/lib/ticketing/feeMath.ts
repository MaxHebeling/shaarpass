/** Matemática de fees compartida (cliente + servidor + marketing). Pura, sin env. */

export const OUR_PERCENT = 2.0;       // margen de la plataforma
export const OUR_FIXED_CENTS = 50;    // + $0.50 por boleto

/**
 * Costo de procesamiento de Stripe (se traslada al comprador, como Eventbrite).
 * Varía por país/moneda. Override por env en el servidor; aquí, defaults por moneda.
 */
export function processingRate(currency = "usd"): { pct: number; fixed: number } {
  // Tarifas de Stripe por país/moneda (aprox). Override global por env. El default
  // cubre la mayoría de mercados; ajustable por organizador en el futuro.
  switch (currency.toLowerCase()) {
    case "mxn": return { pct: 3.6, fixed: 300 };  // Stripe MX ≈ 3.6% + $3 MXN
    case "usd": return { pct: 2.9, fixed: 30 };   // Stripe US ≈ 2.9% + $0.30
    case "cad": return { pct: 2.9, fixed: 30 };
    case "eur": return { pct: 2.5, fixed: 25 };
    case "gbp": return { pct: 2.5, fixed: 20 };
    case "aud": return { pct: 2.9, fixed: 30 };
    case "nzd": return { pct: 2.9, fixed: 30 };
    case "sgd": return { pct: 3.4, fixed: 50 };
    case "brl": return { pct: 3.99, fixed: 39 };
    case "inr": return { pct: 3.0, fixed: 300 };
    default:    return { pct: 3.2, fixed: 30 };   // global razonable (override por env)
  }
}

/** Margen NETO que quiere la plataforma. Eventos gratis = $0. */
export function marginCents(subtotalCents: number, ticketCount: number, pct = OUR_PERCENT, fixed = OUR_FIXED_CENTS): number {
  if (subtotalCents <= 0) return 0;
  return Math.round((subtotalCents * pct) / 100) + fixed * ticketCount;
}

/**
 * Comisión TOTAL al comprador = margen de plataforma + procesamiento de Stripe,
 * con "gross-up": el comprador paga T tal que, después de que Stripe cobre su
 * % sobre TODO el cargo, la plataforma netea su margen y el organizador recibe
 * su neto íntegro (boletos + extras). Sin esto, la plataforma perdería dinero.
 *
 *   T = (organizerNet + margen + procFijo) / (1 − proc% )
 *   comisión = T − organizerNet
 */
export function ourFeeCents(
  subtotalCents: number,
  ticketCount: number,
  currency = "usd",
  passthroughCents = 0,
  pct = OUR_PERCENT,
  fixed = OUR_FIXED_CENTS,
): number {
  const organizerNet = Math.max(0, subtotalCents) + Math.max(0, passthroughCents);
  if (organizerNet <= 0) return 0;
  const m = marginCents(subtotalCents, ticketCount, pct, fixed);
  const proc = processingRate(currency);
  const total = Math.ceil((organizerNet + m + proc.fixed) / (1 - proc.pct / 100));
  return total - organizerNet;
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
