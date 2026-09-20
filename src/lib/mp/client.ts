import { createAdminClient } from "@/lib/supabase/admin";

/** Cliente de Mercado Pago (marketplace). Los cargos se crean con el token del
 *  VENDEDOR (organizador) conectado; `marketplace_fee` = comisión de la plataforma.
 *  Montos en UNIDADES de la moneda (pesos), no centavos. */

const MP_API = "https://api.mercadopago.com";

/** Token de acceso del vendedor conectado (service role; el navegador nunca lo ve). */
export async function getSellerToken(orgId: string): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db.from("mp_connections").select("access_token, connected").eq("org_id", orgId).maybeSingle();
  if (!data?.connected || !data.access_token) return null;
  return data.access_token as string;
}

export interface PreferenceItem { title: string; quantity: number; unit_price: number }

export interface CreatePreferenceInput {
  sellerToken: string;
  items: PreferenceItem[];
  marketplaceFee: number;        // comisión de la plataforma, en pesos
  payerEmail: string;
  externalReference: string;     // = order.id
  notificationUrl: string;
  backUrl: string;
  metadata?: Record<string, unknown>;
}

/** Crea una preferencia de Checkout Pro con split (marketplace_fee). Devuelve el
 *  init_point (checkout hospedado por MP, con tarjeta/OXXO/SPEI/MSI). */
export async function createPreference(input: CreatePreferenceInput): Promise<{ id: string; initPoint: string } | { error: string }> {
  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.sellerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: input.items.map((i) => ({ ...i, currency_id: "MXN" })),
      marketplace_fee: input.marketplaceFee,
      payer: { email: input.payerEmail },
      external_reference: input.externalReference,
      notification_url: input.notificationUrl,
      back_urls: { success: input.backUrl, failure: input.backUrl, pending: input.backUrl },
      auto_return: "approved",
      metadata: input.metadata ?? {},
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data?.id || !data?.init_point) return { error: data?.message || "No se pudo crear la preferencia de Mercado Pago" };
  return { id: data.id, initPoint: data.init_point };
}

/** Consulta un pago por id con el token del vendedor. */
export async function getPayment(sellerToken: string, paymentId: string): Promise<{ status: string; external_reference: string | null; payment_method_id?: string } | null> {
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${sellerToken}` },
  });
  const d = await res.json().catch(() => ({}));
  if (!d?.status) return null;
  return { status: d.status, external_reference: d.external_reference ?? null, payment_method_id: d.payment_method_id };
}
