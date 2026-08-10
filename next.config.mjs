import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
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
  disableLogger: true,
});
