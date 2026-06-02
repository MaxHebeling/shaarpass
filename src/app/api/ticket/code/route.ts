import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";

export const runtime = "nodejs";

// Devuelve el código rotativo actual del boleto (payload = bearer.otp.counter).
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "falta token" }, { status: 400 });

  const db = createPublicClient();
  const { data } = await db.rpc("ticket_rotating_code", { p_token: token });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return NextResponse.json({ error: "boleto no encontrado" }, { status: 404 });

  // Sin secreto/legacy → payload = el token estático.
  const payload = row.otp ? `${row.bearer}.${row.otp}.${row.counter}` : row.bearer;

  // Marca del organizador (white-label).
  const { data: bd } = await db.rpc("ticket_brand", { p_token: token });
  const brand = Array.isArray(bd) ? bd[0] : bd;

  return NextResponse.json({
    payload,
    refreshSeconds: 15,
    brand: brand ? { name: brand.name, logoUrl: brand.logo_url, whiteLabel: brand.white_label } : null,
  });
}
