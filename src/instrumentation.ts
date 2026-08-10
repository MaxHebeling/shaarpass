/**
 * Hook de instrumentación de Next.js.
 *
 * - `register()` arranca Sentry en el runtime que toque (Node o Edge). Si no hay
 *   SENTRY_DSN, los configs no inicializan nada y todo queda inerte.
 * - `onRequestError` se dispara ante cualquier error no manejado en el servidor
 *   (rutas, RSC, server actions) y lo envía al punto único de captura, que ya
 *   se encarga del log estructurado y de Sentry.
 */
import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { captureError } = await import("@/lib/log");
  captureError(err, {
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
  });
};
