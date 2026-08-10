import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness: la app responde. No toca dependencias (barato, para uptime monitors). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "shaarpass",
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    ts: new Date().toISOString(),
  });
}
