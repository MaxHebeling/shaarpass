import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTicketEmail } from "@/lib/email/tickets";
import { getSellerToken, getPayment } from "@/lib/mp/client";

export const runtime = "nodejs";

/** Webhook de Mercado Pago. La notificación trae el id del pago; consultamos el
 *  pago REAL en MP (con el token del vendedor) — así un webhook falso no puede
 *  fingir una aprobación. Al aprobarse, emite los boletos (confirm_order_paid). */
async function handle(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("org");

  // id del pago: formato nuevo (type=payment, data.id) o IPN viejo (topic=payment, id).
  let type = url.searchParams.get("type") || url.searchParams.get("topic") || "";
  let paymentId = url.searchParams.get("data.id") || url.searchParams.get("id") || "";
  if (!paymentId || !type) {
    try {
      const body = await req.json();
      type = type || body?.type || body?.action?.split(".")?.[0] || "";
      paymentId = paymentId || body?.data?.id || "";
    } catch { /* sin body */ }
  }

  // Solo nos interesan pagos. Otros temas (merchant_order, etc.) → 200 y salir.
  if (!type.includes("payment") || !paymentId || !orgId) return NextResponse.json({ received: true });

  const sellerToken = await getSellerToken(orgId);
  if (!sellerToken) return NextResponse.json({ received: true }); // org sin MP → nada que hacer

  const payment = await getPayment(sellerToken, paymentId);
  if (!payment) return NextResponse.json({ error: "pago no encontrado" }, { status: 500 }); // MP reintenta
  const orderId = payment.external_reference;
  if (!orderId) return NextResponse.json({ received: true });

  const db = createAdminClient();

  if (payment.status === "approved") {
    // Idempotente: webhook duplicado = no-op.
    const { error } = await db.rpc("confirm_order_paid", { p_order_id: orderId, p_payment_intent_id: `mp_${paymentId}` });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 }); // reintenta

    const { data: order } = await db
      .from("orders")
      .select("buyer_email, buyer_name, buyer_country, event_id, total_cents, currency, events(title, slug, cover_image, starts_at, timezone, safetix_enabled), organizations(name, logo_url, white_label)")
      .eq("id", orderId).single();
    const { data: tks } = await db.from("tickets").select("qr_token, ticket_types(name)").eq("order_id", orderId);
    if (order && tks?.length) {
      const ev = order.events as unknown as { title: string; slug: string; cover_image: string | null; starts_at: string; timezone: string; safetix_enabled: boolean };
      const og = order.organizations as unknown as { name: string; logo_url: string | null; white_label: boolean } | null;
      await sendTicketEmail({
        to: order.buyer_email,
        eventTitle: ev?.title ?? "Tu evento",
        eventDate: ev?.starts_at ? new Date(ev.starts_at).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: ev.timezone }) : "",
        coverImage: ev?.cover_image ?? null, eventSlug: ev?.slug ?? null,
        currency: order.currency, totalCents: order.total_cents, safetix: ev?.safetix_enabled,
        logoUrl: og?.logo_url ?? null, brand: og?.name ?? null, whiteLabel: og?.white_label ?? false,
        tickets: tks.map((t) => ({ qr_token: t.qr_token, typeName: (t.ticket_types as unknown as { name: string } | null)?.name ?? "Boleto" })),
      });
      try {
        const { sendWelcome } = await import("@/lib/email/campaignSend");
        await sendWelcome(db, order.event_id, { email: order.buyer_email, name: order.buyer_name, country: order.buyer_country });
      } catch { /* best-effort */ }
    }
  } else if (payment.status === "rejected" || payment.status === "cancelled") {
    // Libera el inventario reservado (idempotente; sin efecto si ya está pagada).
    await db.rpc("release_order_holds", { p_order_id: orderId });
  }
  // 'pending'/'in_process' (OXXO/SPEI aún sin pagar) → esperamos otra notificación.

  return NextResponse.json({ received: true });
}

export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }
