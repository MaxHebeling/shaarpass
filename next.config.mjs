import { withSentryConfig } from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";

/**
 * Content-Security-Policy. Allowlist explícito de los terceros REALES del producto:
 *   - Stripe Elements (script js.stripe.com; frames js/hooks; connect api/maps/m/r).
 *   - Cloudflare Turnstile (script + frame challenges.cloudflare.com).
 *   - Supabase (REST https + Realtime wss).
 *   - Vercel Analytics/Speed Insights (connect vitals.vercel-insights.com).
 *   - Sentry (connect *.ingest.sentry.io). img-src https: por portadas de evento
 *     arbitrarias; worker/blob por MapLibre y generación de QR.
 * MercadoPago es por redirect (init_point), navegación de nivel superior: no requiere
 * directiva en página. 'unsafe-inline' en script/style es necesario porque Next inyecta
 * scripts/estilos de arranque sin nonce; aun así se bloquea cargar scripts de orígenes
 * no listados (anti-XSS por inyección de <script src>).
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self' https://*.stripe.com https://*.mercadopago.com https://*.mercadopago.com.mx",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://challenges.cloudflare.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://maps.stripe.com https://m.stripe.network https://r.stripe.com https://vitals.vercel-insights.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.sentry.io",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

// Cabeceras siempre seguras (no rompen funcionalidad). La CSP solo se aplica en
// producción: en dev Next usa eval para HMR y la CSP estricta lo rompería.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // El escáner de check-in usa la cámara; Stripe Wallets usa Payment Request API.
  { key: "Permissions-Policy", value: 'camera=(self), microphone=(), geolocation=(), payment=(self "https://js.stripe.com"), usb=(), bluetooth=()' },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  ...(isProd ? [{ key: "Content-Security-Policy", value: csp }] : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No filtrar el header que revela el framework.
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Incluye las fuentes TTF (OG image) en el bundle serverless de la ruta /e/[slug]/og.
  outputFileTracingIncludes: {
    "/e/[slug]/og": ["./src/app/e/[slug]/og/fonts/**"],
  },
};

/**
 * Sentry envuelve la config para instrumentar el servidor y, cuando hay
 * credenciales, subir los source maps.
 *
 * Sin SENTRY_AUTH_TOKEN no se generan ni se suben source maps: el build es el
 * mismo de siempre. Sin SENTRY_DSN el SDK ni siquiera se inicializa. Es decir:
 * este wrapper es inerte hasta que pongas las variables en Vercel.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  // Oculta las rutas locales en los stack traces subidos.
  widenClientFileUpload: false,
});
