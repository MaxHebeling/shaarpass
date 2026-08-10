/**
 * Hook de instrumentación de Next.js. onRequestError se dispara ante cualquier
 * error no manejado en el servidor (rutas, RSC, etc.) y lo envía al punto único
 * de captura. Listo para Sentry sin tocar el resto del código.
 */
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { captureError } = await import("@/lib/log");
  captureError(err, {
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
  });
};
