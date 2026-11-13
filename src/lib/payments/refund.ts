/**
 * Reembolso del pago de una orden, en la pasarela donde realmente vive el cargo.
 *
 * - Stripe: los cargos son DIRECTOS sobre la cuenta Connect del organizador
 *   (migración 0001), así que el reembolso debe crearse en ESA cuenta
 *   (`stripeAccount`). Antes se llamaba en la cuenta de plataforma y Stripe
 *   respondía "No such payment_intent". Los cargos antiguos (destination charges,
 *   anteriores a 0001) viven en la plataforma: si la cuenta conectada no conoce el
 *   PaymentIntent, se reintenta en la plataforma.
 * - Mercado Pago: la orden guarda `mp_<paymentId>`; se reembolsa con el token del
 *   vendedor (organizador) conectado.
 *
 * La comisión de ShaarPass (application fee / marketplace fee) NO se devuelve
 * (comportamiento por defecto de ambas pasarelas).
 */
import { getStripe } from "@/lib/stripe/client";
import { getSellerToken } from "@/lib/mp/client";

export type RefundResult = { ok: true; alreadyRefunded?: boolean } | { ok: false; error: string };

interface StripeLikeError { code?: string; raw?: { code?: string; message?: string }; message?: string }

const code = (e: unknown) => (e as StripeLikeError)?.code ?? (e as StripeLikeError)?.raw?.code;
const msg = (e: unknown) => (e as StripeLikeError)?.raw?.message ?? (e as StripeLikeError)?.message ?? "error desconocido";

export async function refundOrderPayment(p: {
  paymentId: string | null | undefined;
  stripeAccountId: string | null | undefined;
  orgId: string;
}): Promise<RefundResult> {
  if (!p.paymentId) return { ok: true }; // comp / cortesía / venta en puerta: sin pago que devolver

  // ── Mercado Pago ──
  if (p.paymentId.startsWith("mp_")) {
    const token = await getSellerToken(p.orgId);
    if (!token) return { ok: false, error: "Mercado Pago no está conectado para esta organización" };
    const id = p.paymentId.slice(3);
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}/refunds`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Idempotency-Key": `refund_${id}` },
      body: "{}",
    });
    if (res.ok) return { ok: true };
    const d = await res.json().catch(() => ({} as { message?: string }));
    const text = String((d as { message?: string }).message ?? res.status);
    if (/already.*refunded|totally refunded/i.test(text)) return { ok: true, alreadyRefunded: true };
    return { ok: false, error: `Mercado Pago: ${text}` };
  }

  // ── Stripe ──
  const stripe = getStripe();
  const idempotencyKey = `refund_${p.paymentId}`;
  const attempt = async (stripeAccount?: string) => {
    try {
      await stripe.refunds.create({ payment_intent: p.paymentId! }, stripeAccount ? { stripeAccount, idempotencyKey } : { idempotencyKey });
      return { ok: true } as RefundResult;
    } catch (e) {
      if (code(e) === "charge_already_refunded") return { ok: true, alreadyRefunded: true } as RefundResult;
      throw e;
    }
  };
  try {
    if (p.stripeAccountId) {
      try {
        return await attempt(p.stripeAccountId);
      } catch (e) {
        // Cargo antiguo creado en la plataforma (destination charge): no existe en la cuenta conectada.
        if (code(e) !== "resource_missing") throw e;
      }
    }
    return await attempt();
  } catch (e) {
    return { ok: false, error: `Stripe: ${msg(e)}` };
  }
}
