import Stripe from "stripe";

// Inicialización lazy: no instanciar en build (cuando no hay env vars).
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia",
      // httpClient fetch obligatorio en serverless (Vercel): el http de Node falla en cold starts.
      httpClient: Stripe.createFetchHttpClient(),
    });
  }
  return _stripe;
}
