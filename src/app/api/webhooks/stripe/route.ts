import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTicketEmail } from "@/lib/email/tickets";
import { OXXO_EXPIRES_AFTER_DAYS, SPEI_EXPIRES_AFTER_DAYS } from "@/lib/stripe/paymentMethods";
import type Stripe from "stripe";

export const runtime = "nodejs";

/**
 * Verifica la firma contra AMBOS secretos: el del webhook de la cuenta (eventos de
 * plataforma, p.ej. account.updated) y el del webhook de cuentas conectadas (los
 * cargos DIRECTOS del organizador llegan como eventos de cuenta conectada, con
 * event.account definido). Un solo endpoint atiende ambos flujos.
 */
async function verify(body: string, sig: string): Promise<Stripe.Event | null> {
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(Boolean) as string[];
  for (const secret of secrets) {
    try {
      return await getStripe().webhooks.constructEventAsync(body, sig, secret);
    } catch { /* prueba el siguiente secreto */ }
  }
  return null;
}

/** Método async a partir del next_action de un PaymentIntent en 'processing'. */
function asyncMethodFrom(pi: Stripe.PaymentIntent): { method: string; voucherUrl: string | null; expiresAt: string } | null {
  const na = pi.next_action;
  if (na?.type === "oxxo_display_details") {
    const d = na.oxxo_display_details;
    return {
      method: "oxxo",
      voucherUrl: d?.hosted_voucher_url ?? null,
      expiresAt: d?.expires_after
        ? new Date(d.expires_after * 1000).toISOString()
        : new Date(Date.now() + OXXO_EXPIRES_AFTER_DAYS * 86400_000).toISOString(),
    };
  }
  if (na?.type === "display_bank_transfer_instructions") {
    // SPEI (customer_balance / mx_bank_transfer): la referencia no trae expiración
    // fija, usamos un default para la reserva de inventario.
    const d = na.display_bank_transfer_instructions;
    return {
      method: "spei",
      voucherUrl: d?.hosted_instructions_url ?? null,
      expiresAt: new Date(Date.now() + SPEI_EXPIRES_AFTER_DAYS * 86400_000).toISOString(),
    };
  }
  return null;
}

async function fulfillOrder(db: ReturnType<typeof createAdminClient>, orderId: string, pi: Stripe.PaymentIntent): Promise<NextResponse | null> {
  // confirm_order_paid es idempotente: webhook duplicado = no-op.
  const { error } = await db.rpc("confirm_order_paid", { p_order_id: orderId, p_payment_intent_id: pi.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); // 500 → Stripe reintenta

  const { data: order } = await db
    .from("orders")
    .select("buyer_email, buyer_name, buyer_country, event_id, total_cents, currency, events(title, slug, cover_image, starts_at, timezone, safetix_enabled), organizations(name, logo_url, white_label)")
    .eq("id", orderId)
    .single();
  const { data: tks } = await db.from("tickets").select("qr_token, ticket_types(name)").eq("order_id", orderId);

  if (order && tks?.length) {
    const ev = order.events as unknown as { title: string; slug: string; cover_image: string | null; starts_at: string; timezone: string; safetix_enabled: boolean };
    const org = order.organizations as unknown as { name: string; logo_url: string | null; white_label: boolean } | null;
    await sendTicketEmail({
      to: order.buyer_email,
      eventTitle: ev?.title ?? "Tu evento",
      eventDate: ev?.starts_at ? new Date(ev.starts_at).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: ev.timezone }) : "",
      coverImage: ev?.cover_image ?? null,
      eventSlug: ev?.slug ?? null,
      currency: order.currency,
      totalCents: order.total_cents,
      safetix: ev?.safetix_enabled,
      logoUrl: org?.logo_url ?? null,
      brand: org?.name ?? null,
      whiteLabel: org?.white_label ?? false,
      tickets: tks.map((t) => ({ qr_token: t.qr_token, typeName: (t.ticket_types as unknown as { name: string } | null)?.name ?? "Boleto" })),
    });
    try {
      const { sendWelcome } = await import("@/lib/email/campaignSend");
      await sendWelcome(db, order.event_id, { email: order.buyer_email, name: order.buyer_name, country: order.buyer_country });
    } catch { /* best-effort */ }
  }
  return null;
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text(); // raw body para verificar firma
  if (!sig) return NextResponse.json({ error: "sin firma" }, { status: 400 });

  const event = await verify(body, sig);
  if (!event) return NextResponse.json({ error: "firma inválida" }, { status: 400 });

  const db = createAdminClient();

  switch (event.type) {
    // Método async (OXXO/SPEI): la ficha/referencia se emitió, el pago AÚN NO entra.
    // Extiende la reserva de inventario hasta el vencimiento de la ficha y avisa al
    // comprador con su liga de pago. NO se emiten boletos todavía.
    //
    // OJO: para OXXO el PaymentIntent emite la ficha en estado 'requires_action'
    // (evento payment_intent.requires_action), NO 'processing' — este último no se
    // dispara al emitir la ficha. Escuchamos ambos por robustez; el guard de
    // asyncMethodFrom (next_action = oxxo_display_details) evita disparar en el
    // requires_action de un 3DS de tarjeta.
    case "payment_intent.requires_action":
    case "payment_intent.processing": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = pi.metadata?.order_id;
      const info = asyncMethodFrom(pi);
      if (orderId && info) {
        const { error } = await db.rpc("mark_order_awaiting_payment", {
          p_order_id: orderId,
          p_method: info.method,
          p_voucher_url: info.voucherUrl,
          p_expires_at: info.expiresAt,
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        // Envía la ficha/referencia de pago al comprador (best-effort; también en /gracias).
        if (info.voucherUrl) {
          try {
            const { data: o } = await db.from("orders").select("buyer_email").eq("id", orderId).maybeSingle();
            if (o?.buyer_email) {
              const { sendBulkEmail } = await import("@/lib/email/campaigns");
              const isSpei = info.method === "spei";
              await sendBulkEmail(
                [o.buyer_email],
                isSpei ? "Tu referencia de pago SPEI (ShaarPass)" : "Tu ficha de pago OXXO (ShaarPass)",
                isSpei
                  ? `Haz tu transferencia SPEI con los datos aquí: ${info.voucherUrl}\n\nEn cuanto recibamos el pago te enviamos tus boletos con QR.`
                  : `Genera y paga tu ficha OXXO aquí: ${info.voucherUrl}\n\nEn cuanto recibamos el pago te enviamos tus boletos con QR. La ficha vence pronto: no la dejes pasar.`,
              );
            }
          } catch { /* best-effort */ }
        }
      }
      break;
    }

    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;

      // Reventa fan-to-fan: transfiere el boleto al comprador (registra payout al vendedor).
      if (pi.metadata?.kind === "resale" && pi.metadata?.listing_id) {
        const buyer = pi.metadata.buyer_email;
        const { data: newToken } = await db.rpc("buy_listing", { p_listing: pi.metadata.listing_id, p_buyer_email: buyer });
        if (newToken) {
          const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3007";
          try {
            const { sendBulkEmail } = await import("@/lib/email/campaigns");
            await sendBulkEmail([buyer], "Compraste un boleto en reventa (ShaarPass)", `Tu boleto seguro: ${base}/t/${newToken}`);
          } catch { /* best-effort */ }

          // Desembolso al vendedor: avisa + paga ya si su cuenta está conectada.
          try {
            const { data: payout } = await db
              .from("resale_payouts")
              .select("id, seller_email, claim_token")
              .eq("listing_id", pi.metadata.listing_id).eq("status", "owed")
              .order("created_at", { ascending: false }).limit(1).maybeSingle();
            if (payout) {
              const { sendBulkEmail } = await import("@/lib/email/campaigns");
              await sendBulkEmail([payout.seller_email], "Tu boleto se vendió — cobra tu dinero (ShaarPass)",
                `¡Buenas noticias! Tu boleto en reventa se vendió. Cobra tu dinero aquí: ${base}/cobrar/${payout.claim_token}`);
              const { processPayout } = await import("@/lib/resale/payout");
              await processPayout(db, payout.id); // no-op si aún no conecta su cuenta
            }
          } catch { /* best-effort; el cron reintenta */ }
        }
        break;
      }

      // Abono / temporada: emite un boleto por cada evento del abono.
      if (pi.metadata?.kind === "season" && pi.metadata?.order_id) {
        const sOrderId = pi.metadata.order_id;
        const { error } = await db.rpc("confirm_season_pass", { p_order: sOrderId });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        try {
          const { sendBulkEmail } = await import("@/lib/email/campaigns");
          const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.shaarpass.io";
          const { data: o } = await db.from("orders").select("buyer_email, manage_token, seasons(title)").eq("id", sOrderId).maybeSingle();
          const title = (o?.seasons as unknown as { title: string } | null)?.title ?? "tu abono";
          if (o?.manage_token) {
            await sendBulkEmail([o.buyer_email], `Tu abono está listo: ${title} (ShaarPass)`,
              `Gestiona todos los boletos de tu abono aquí: ${base}/abono/${o.manage_token}`);
          }
        } catch { /* best-effort */ }
        break;
      }

      const orderId = pi.metadata?.order_id;
      if (orderId) {
        const res = await fulfillOrder(db, orderId, pi);
        if (res) return res;
      }
      break;
    }

    // Connect: la cuenta del organizador cambió de estado.
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      // charges_enabled = puede VENDER (cargo directo cae en su cuenta).
      // payouts_enabled (col) = totalmente habilitado / ya recibe depósitos al banco.
      const canSell = Boolean(account.charges_enabled);
      const fullyEnabled = Boolean(
        account.charges_enabled && account.payouts_enabled && account.details_submitted
        && !account.requirements?.disabled_reason
      );
      // Métodos de pago disponibles según capabilities ACTIVAS de la cuenta conectada.
      const caps = account.capabilities ?? {};
      await db
        .from("organizations")
        .update({
          charges_enabled: canSell,
          payouts_enabled: fullyEnabled,
          oxxo_enabled: caps.oxxo_payments === "active",
          spei_enabled: caps.mx_bank_transfer_payments === "active",
        })
        .eq("stripe_account_id", account.id);
      break;
    }

    // Falló el pago o venció la ficha OXXO/SPEI → libera la reserva de inventario.
    case "payment_intent.payment_failed":
    case "payment_intent.canceled": {
      const pi = event.data.object as Stripe.PaymentIntent;
      // Reventa: libera el listing reservado para que otro pueda comprarlo.
      if (pi.metadata?.kind === "resale" && pi.metadata?.listing_id) {
        await db.rpc("release_listing", { p_listing: pi.metadata.listing_id });
        break;
      }
      const orderId = pi.metadata?.order_id;
      if (orderId) {
        // Abono: el cupo se reservó al crear la orden → liberarlo.
        if (pi.metadata?.kind === "season" && pi.metadata?.season_id) {
          await db.from("orders").update({ status: "failed" }).eq("id", orderId).in("status", ["pending", "awaiting_payment"]);
          await db.rpc("release_season_pass", { p_season: pi.metadata.season_id });
        } else {
          // Eventos: libera holds (GA y asientos) extendidos y marca la orden.
          // Idempotente y sin efecto si la orden ya fue pagada.
          await db.rpc("release_order_holds", { p_order_id: orderId });
        }
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
