import { loadStripe, type Stripe } from "@stripe/stripe-js";

let _promise: Promise<Stripe | null> | null = null;

/** Singleton de Stripe.js en el cliente. null si no hay key configurada. */
export function getStripePromise(): Promise<Stripe | null> {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key || key.includes("REEMPLAZA")) return Promise.resolve(null);
  if (!_promise) _promise = loadStripe(key);
  return _promise;
}
