/**
 * Métodos de pago disponibles por moneda/monto/CAPABILITIES de la cuenta conectada —
 * DECISIÓN PURA (sin efectos), compartida por el servidor y probada en unit tests.
 *
 * Contexto: cargos DIRECTOS sobre la cuenta Connect del organizador. Un método solo
 * se ofrece si la cuenta conectada tiene la capability ACTIVA; si no, Stripe
 * rechazaría TODO el PaymentIntent (no solo ese método) y rompería el checkout.
 *   - OXXO (efectivo, MXN)  → capability oxxo_payments
 *   - SPEI (customer_balance / mx_bank_transfer, MXN) → capability mx_bank_transfer_payments
 */

/** Límites de OXXO en Stripe (MXN). Fuera de este rango, OXXO no se ofrece. */
export const OXXO_MIN_CENTS = 1000;        // $10 MXN
export const OXXO_MAX_CENTS = 1_000_000;   // $10,000 MXN (tope por ficha)
/** SPEI (transferencia bancaria): sin tope superior práctico; mínimo simbólico. */
export const SPEI_MIN_CENTS = 1000;        // $10 MXN

/** Días que mantenemos la reserva de inventario para métodos async. */
export const OXXO_EXPIRES_AFTER_DAYS = 3;
export const SPEI_EXPIRES_AFTER_DAYS = 3;  // la referencia SPEI no trae expiración fija

/** Capabilities relevantes de la cuenta conectada. */
export interface AccountCaps {
  oxxo: boolean;   // oxxo_payments activa
  spei: boolean;   // mx_bank_transfer_payments activa
}

/** Métodos async (el pago NO entra al confirmar: hay que esperar el webhook). */
const ASYNC_METHODS = new Set(["oxxo", "spei", "customer_balance"]);

export function isAsyncMethod(method: string | null | undefined): boolean {
  return !!method && ASYNC_METHODS.has(method);
}

/**
 * Qué payment_method_types habilitar para un cargo, según moneda, monto y las
 * capabilities ACTIVAS de la cuenta conectada.
 */
export function paymentMethodsFor(currency: string, totalCents: number, caps: AccountCaps = { oxxo: false, spei: false }): string[] {
  const methods = ["card"];
  const cur = (currency ?? "").toLowerCase();
  if (cur === "mxn") {
    if (caps.oxxo && totalCents >= OXXO_MIN_CENTS && totalCents <= OXXO_MAX_CENTS) methods.push("oxxo");
    if (caps.spei && totalCents >= SPEI_MIN_CENTS) methods.push("customer_balance");
  }
  return methods;
}

/** ¿Alguno de los métodos requiere un Customer en el PaymentIntent? (SPEI/customer_balance sí). */
export function requiresCustomer(methods: string[]): boolean {
  return methods.includes("customer_balance");
}

/**
 * payment_method_options para el PaymentIntent (vencimiento de la ficha OXXO;
 * tipo de transferencia SPEI). Mantén esto alineado con la extensión del hold.
 */
export function paymentMethodOptions(methods: string[]): Record<string, unknown> | undefined {
  const opts: Record<string, unknown> = {};
  if (methods.includes("oxxo")) opts.oxxo = { expires_after_days: OXXO_EXPIRES_AFTER_DAYS };
  if (methods.includes("customer_balance")) {
    opts.customer_balance = {
      funding_type: "bank_transfer",
      bank_transfer: { type: "mx_bank_transfer", requested_address_types: ["spei"] },
    };
  }
  return Object.keys(opts).length ? opts : undefined;
}
