import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserOrg } from "@/lib/org";

export const runtime = "nodejs";

/** El organizador vuelve de autorizar en Mercado Pago. Intercambia el code por
 *  tokens del vendedor y los guarda (service role) en mp_connections. */
export async function GET(req: Request) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.shaarpass.io";
  const fail = (code: string) => NextResponse.redirect(new URL(`/dashboard/pagos?mp_error=${code}`, base));

  const url = new URL(req.url);
  const authCode = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const db = await createClient();
  const org = await getUserOrg(db);
  // La sesión sigue presente (redirect en el navegador); el state debe coincidir.
  if (!org || !authCode || !state || state !== org.id) return fail("state");

  const clientId = process.env.MP_CLIENT_ID;
  const clientSecret = process.env.MP_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail("config");

  let data: { access_token?: string; refresh_token?: string; user_id?: number | string; public_key?: string; expires_in?: number };
  try {
    const res = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: `${base}/api/mp/connect/callback`,
      }),
    });
    data = await res.json();
  } catch {
    return fail("exchange");
  }
  if (!data?.access_token || !data?.user_id) return fail("token");

  const admin = createAdminClient();
  const { error } = await admin.from("mp_connections").upsert({
    org_id: org.id,
    mp_user_id: String(data.user_id),
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? null,
    public_key: data.public_key ?? null,
    expires_at: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
    connected: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "org_id" });
  if (error) return fail("save");

  // Señal no secreta para la UI. NO cambiamos payment_gateway aquí: el checkout de
  // MP llega en un PR posterior; el organizador lo elige cuando esté disponible.
  await admin.from("organizations").update({ mp_connected: true }).eq("id", org.id);

  return NextResponse.redirect(new URL("/dashboard/pagos?mp=conectado", base));
}
