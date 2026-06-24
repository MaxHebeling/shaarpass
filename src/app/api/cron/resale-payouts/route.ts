import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processOwedPayouts } from "@/lib/resale/payout";

export const runtime = "nodejs";

/** Barrido periódico: paga a los vendedores cuyas cuentas ya están habilitadas
 *  (red de seguridad para quien conectó su cuenta DESPUÉS de la venta).
 *  Lo invoca Vercel Cron; protegido con CRON_SECRET. */
export async function GET(req: Request) {
  // CRON_SECRET obligatorio: sin él (o sin coincidencia) el endpoint NO se abre.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const db = createAdminClient();
  const result = await processOwedPayouts(db);
  return NextResponse.json({ ok: true, ...result });
}
