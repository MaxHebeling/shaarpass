import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { validateEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Readiness: verifica dependencias críticas (base de datos + configuración). Para smoke tests/alertas. */
export async function GET() {
  const checks: Record<string, "ok" | "fail"> = {};

  // 1) Base de datos.
  try {
    const db = createPublicClient();
    const { error } = await db.from("events").select("id", { head: true, count: "exact" }).limit(1);
    checks.database = error ? "fail" : "ok";
  } catch {
    checks.database = "fail";
  }

  // 2) Configuración: variables requeridas presentes (solo nombres, nunca valores).
  const env = validateEnv();
  checks.config = env.ok ? "ok" : "fail";

  const ready = Object.values(checks).every((v) => v === "ok");
  const body: Record<string, unknown> = { ready, checks, ts: new Date().toISOString() };
  if (!env.ok) body.configMissing = [...env.missing, ...env.invalid]; // nombres, para diagnosticar
  return NextResponse.json(body, { status: ready ? 200 : 503 });
}
