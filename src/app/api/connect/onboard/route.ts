import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";
import { getUserOrg } from "@/lib/org";

export const runtime = "nodejs";

/** Crea (o reutiliza) la cuenta Stripe Connect Express del organizador y
 *  devuelve un link de onboarding al que redirigir. */
export async function POST() {
  const db = await createClient();
  const org = await getUserOrg(db);
  if (!org) return NextResponse.json({ error: "Sin organización" }, { status: 401 });

  try {
    const stripe = getStripe();
    let accountId = org.stripe_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        metadata: { org_id: org.id },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
          // OXXO (efectivo, MX) en cargos directos requiere esta capability en la
          // cuenta del organizador. Stripe la pide en el onboarding si aplica.
          oxxo_payments: { requested: true },
        },
        business_profile: { name: org.name },
      });
      accountId = account.id;
      // El owner puede actualizar su org (RLS).
      await db.from("organizations").update({ stripe_account_id: accountId }).eq("id", org.id);
    }

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3007";
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${base}/dashboard/pagos`,
      return_url: `${base}/api/connect/return`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: link.url });
  } catch (e) {
    // Devuelve el motivo REAL (de Stripe) como JSON. Antes, un throw sin capturar
    // hacía que el cliente recibiera una página de error y Safari mostrara un
    // críptico "The string did not match the expected pattern." en res.json().
    const { captureError } = await import("@/lib/log");
    const errorId = captureError(e, { route: "connect/onboard", orgId: org.id });
    const stripeMsg = (e as { raw?: { message?: string } })?.raw?.message;
    const msg = stripeMsg || (e as Error).message || "Error desconocido al conectar con Stripe";
    return NextResponse.json(
      { error: `No se pudo iniciar la conexión con Stripe: ${msg}`, errorId },
      { status: 502 },
    );
  }
}
