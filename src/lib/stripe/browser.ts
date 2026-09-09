import { loadStripe, type Stripe } from "@stripe/stripe-js";

// Cargos DIRECTOS: el PaymentIntent vive en la cuenta Connect del organizador, así
// que Stripe.js debe inicializarse con { stripeAccount } o el clientSecret no valida.
// Memoizamos una promesa por cuenta (la plataforma tiene su propia entrada).
const _cache = new Map<string, Promise<Stripe | null>>();

/**
 * Singleton de Stripe.js en el cliente. Pasa el id de la cuenta Connect del
 * organizador para cargos directos; sin él, usa la cuenta de la plataforma.
 * Devuelve null si no hay publishable key configurada.
 */
export function getStripePromise(stripeAccount?: string): Promise<Stripe | null> {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key || key.includes("REEMPLAZA")) return Promise.resolve(null);
  const cacheKey = stripeAccount || "_platform";
  let p = _cache.get(cacheKey);
  if (!p) {
    p = loadStripe(key, stripeAccount ? { stripeAccount } : undefined);
    _cache.set(cacheKey, p);
  }
  return p;
}
