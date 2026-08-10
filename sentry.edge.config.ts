/**
 * Sentry — runtime Edge (middleware y rutas con `runtime = "edge"`).
 * Mismo criterio que el de servidor: sin `SENTRY_DSN` no se inicializa nada.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    sendDefaultPii: false,
    debug: false,
  });
}
