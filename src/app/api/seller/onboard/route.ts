import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";

export const runtime = "nodejs";

// Onboarding al momento de listar (token = qr_token del boleto que aún posee el
// vendedor) o tras la venta (claimToken = bearer del payout).
const Body = z.object({
  token: z.string().optional(),
  claimToken: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.token && !parsed.data.claimToken)) {
    return NextResponse.json({ error: "Falta token" }, { status: 400 });
  }
  const db = createAdminClient();

  // Resuelve el email del vendedor de forma verificable (no se confía en input).
  let email: string | null = null;
  let claim: string | null = parsed.data.claimToken ?? null;
  if (parsed.data.claimToken) {
    // El enlace de cobro expira a los 30 días (limita el riesgo de un link interceptado).
    const cutoff = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data: p } = await db.from("resale_payouts").select("seller_email")
      .eq("claim_token", parsed.data.claimToken).gte("created_at", cutoff).maybeSingle();
    if (!p) return NextResponse.json({ error: "El enlace de cobro expiró o no es válido. Escríbenos a tickets@shaarpass.io." }, { status: 410 });
    email = p.seller_email ?? null;
  } else if (parsed.data.token) {
    const { data: t } = await db.from("tickets").select("attendees(email)").eq("qr_token", parsed.data.token).maybeSingle();
    email = (t?.attendees as unknown as { email: string } | null)?.email ?? null;
  }
  if (!email) return NextResponse.json({ error: "No se pudo identificar al vendedor" }, { status: 404 });

  const stripe = getStripe();

  // Crea o reutiliza la cuenta Express del vendedor.
  const { data: existing } = await db.from("seller_accounts").select("stripe_account_id").eq("email", email).maybeSingle();
  let accountId = existing?.stripe_account_id ?? null;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email,
      capabilities: { transfers: { requested: true } },
      metadata: { seller_email: email },
    });
    accountId = account.id;
    await db.from("seller_accounts").upsert({ email, stripe_account_id: accountId }, { onConflict: "email" });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3007";
  const ret = new URL(`${base}/api/seller/return`);
  ret.searchParams.set("email", email);
  if (claim) ret.searchParams.set("claim", claim);

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: claim ? `${base}/cobrar/${claim}` : `${base}/cobrar/listo`,
    return_url: ret.toString(),
    type: "account_onboarding",
  });

  return NextResponse.json({ url: link.url });
}
