import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Maneja el enlace de confirmación de correo de Supabase Auth (flujo token_hash).
 * Verifica el OTP, deja la sesión iniciada y manda al dashboard — en vez del 404.
 * Requiere que el template "Confirm signup" use:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";
  const base = process.env.NEXT_PUBLIC_APP_URL ?? origin;

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL(next, base));
  }
  // Link inválido/expirado o sin parámetros → a login con aviso (no 404).
  return NextResponse.redirect(new URL("/login?msg=confirma", base));
}
