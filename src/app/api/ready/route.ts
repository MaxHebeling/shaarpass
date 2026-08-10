import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Readiness: verifica dependencias críticas (base de datos). Para smoke tests/alertas. */
export async function GET() {
  const checks: Record<string, "ok" | "fail"> = {};
  try {
    const db = createPublicClient();
    const { error } = await db.from("events").select("id", { head: true, count: "exact" }).limit(1);
    checks.database = error ? "fail" : "ok";
  } catch {
    checks.database = "fail";
  }
  const ready = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json({ ready, checks, ts: new Date().toISOString() }, { status: ready ? 200 : 503 });
}
