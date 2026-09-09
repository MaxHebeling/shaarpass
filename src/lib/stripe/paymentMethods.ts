/**
 * Métodos de pago disponibles por moneda/monto — DECISIÓN PURA (sin efectos),
 * compartida por el servidor (crea el PaymentIntent) y probada en unit tests.
 *
 * Contexto: cargos DIRECTOS sobre la cuenta Connect del organizador. Para México
 * ofrecemos también OXXO (efectivo, asíncrono). SPEI se sumará sobre la misma
 * infraestructura async (customer_balance) en un incremento posterior.
 */

/** Límites de OXXO en Stripe (MXN). Fuera de este rango, OXXO no se ofrece. */
export const OXXO_MIN_CENTS = 1000;        // $10 MXN
export const OXXO_MAX_CENTS = 1_000_000;   // $10,000 MXN (tope por ficha)

/** Métodos async (el pago NO entra al confirmar: hay que esperar el webhook). */
const ASYNC_METHODS = new Set(["oxxo", "spei", "customer_balance"]);

export function isAsyncMethod(method: string | null | undefined): boolean {
  return !!method && ASYNC_METHODS.has(method);
}

/**
 * Qué payment_method_types habilitar para un cargo.
 * @param currency moneda del evento (minúsculas o mayúsculas)
 * @param totalCents total que paga el comprador
 */
export function paymentMethodsFor(currency: string, totalCents: number): string[] {
  const methods = ["card"];
  const cur = (currency ?? "").toLowerCase();
  if (cur === "mxn" && totalCents >= OXXO_MIN_CENTS && totalCents <= OXXO_MAX_CENTS) {
    methods.push("oxxo");
  }
  return methods;
}

/**
 * payment_method_options para el PaymentIntent (p. ej. cuántos días vive la ficha
 * OXXO). Mantén esto alineado con la extensión del hold de inventario en el webhook.
 */
export const OXXO_EXPIRES_AFTER_DAYS = 3;

export function paymentMethodOptions(methods: string[]): Record<string, unknown> | undefined {
  if (!methods.includes("oxxo")) return undefined;
  return { oxxo: { expires_after_days: OXXO_EXPIRES_AFTER_DAYS } };
}
