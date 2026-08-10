import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness: la app responde. No toca dependencias (barato, para uptime monitors).
 *
 * `deployment` es lo que hace esto útil de verdad: `version` es el commit, y un
 * redeploy del MISMO commit —el caso típico tras cambiar una variable de
 * entorno— devuelve el mismo valor, así que no sirve para saber si el redeploy
 * entró. `VERCEL_URL` es único por deployment y sí lo responde.
 *
 * Ninguno de los tres es secreto.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "shaarpass",
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    deployment: process.env.VERCEL_URL ?? "local",
    env: process.env.VERCEL_ENV ?? "development",
    ts: new Date().toISOString(),
  });
}
