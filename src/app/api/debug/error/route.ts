import { NextResponse } from "next/server";
import { captureError } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Disparador de errores de prueba — para verificar la cadena de observabilidad
 * de punta a punta sin esperar a que se rompa algo de verdad.
 *
 * Protegida con `CRON_SECRET` (mismo esquema que los crons). Sin la cabecera
 * correcta responde **404**, no 401: no anunciamos que la ruta existe.
 *
 * Dos modos, porque prueban cosas distintas:
 *   ?mode=capture (default) → llama a captureError y DEVUELVE el errorId.
 *      Verifica el transporte a Sentry y te da el id para buscarlo allí.
 *   ?mode=throw → lanza de verdad, sin atrapar.
 *      Verifica el camino completo: onRequestError → captureError → Sentry.
 *      El errorId solo queda en los logs de Vercel y en Sentry.
 *
 * Uso:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://www.shaarpass.io/api/debug/error
 *   curl -H "Authorization: Bearer $CRON_SECRET" "https://www.shaarpass.io/api/debug/error?mode=throw"
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  // Sin secreto configurado la ruta simplemente no existe.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const mode = new URL(req.url).searchParams.get("mode") ?? "capture";
  const err = new Error(`Error de prueba de observabilidad (mode=${mode})`);

  if (mode === "throw") {
    // A propósito sin try/catch: lo recoge onRequestError en instrumentation.ts.
    throw err;
  }

  const errorId = captureError(err, { source: "debug/error", mode });
  return NextResponse.json({
    ok: true,
    errorId,
    sentry: Boolean(process.env.SENTRY_DSN),
    hint: "Busca este errorId en Sentry y en los logs de Vercel; deben coincidir.",
  });
}
