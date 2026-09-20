import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserOrg } from "@/lib/org";

export const runtime = "nodejs";

/** Inicia el OAuth de Mercado Pago (marketplace): redirige al organizador a MP
 *  para que autorice a la plataforma a cobrar en su nombre. */
export async function GET() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.shaarpass.io";
  const db = await createClient();
  const org = await getUserOrg(db);
  if (!org) return NextResponse.redirect(new URL("/login", base));

  const clientId = process.env.MP_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(new URL("/dashboard/pagos?mp_error=config", base));

  const redirectUri = `${base}/api/mp/connect/callback`;
  // state = id de la org (se re-verifica en el callback contra la sesión → anti-CSRF).
  const authUrl = new URL("https://auth.mercadopago.com.mx/authorization");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("platform_id", "mp");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", org.id);

  return NextResponse.redirect(authUrl.toString());
}
