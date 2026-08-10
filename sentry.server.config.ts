/**
 * Sentry — runtime Node (rutas API, server actions, RSC).
 *
 * INERTE SIN DSN: si `SENTRY_DSN` no está puesto, no se inicializa nada y
 * `Sentry.captureException` queda como no-op. Para activarlo basta con añadir
 * SENTRY_DSN en Vercel y redesplegar — cero cambios de código.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    // Commit desplegado: permite atribuir un error a un deploy concreto.
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    // Muestreo de trazas: arrancamos bajo para no gastar cuota; súbelo si hace falta.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    // Nunca mandamos cuerpos de petición ni cookies: pueden traer datos del comprador.
    sendDefaultPii: false,
    debug: false,
  });
}
