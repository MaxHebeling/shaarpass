import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTicketEmail } from "@/lib/email/tickets";
import type Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text(); // raw body para verificar firma
  if (!sig) return NextResponse.json({ error: "sin firma" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return NextResponse.json({ error: `firma inválida: ${(err as Error).message}` }, { status: 400 });
  }

  const db = createAdminClient();

  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = pi.metadata?.order_id;
      if (orderId) {
        // confirm_order_paid es idempotente: webhook duplicado = no-op.
        const { error } = await db.rpc("confirm_order_paid", {
          p_order_id: orderId,
          p_payment_intent_id: pi.id,
        });
        if (error) {
          // 500 → Stripe reintenta el webhook.
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Envía los boletos con QR por email.
        const { data: order } = await db
          .from("orders")
          .select("buyer_email, total_cents, currency, events(title, starts_at, timezone)")
          .eq("id", orderId)
          .single();
        const { data: tks } = await db
          .from("tickets")
          .select("qr_token, ticket_types(name)")
          .eq("order_id", orderId);

        if (order && tks?.length) {
          const ev = order.events as unknown as { title: string; starts_at: string; timezone: string };
          await sendTicketEmail({
            to: order.buyer_email,
            eventTitle: ev?.title ?? "Tu evento",
            eventDate: ev?.starts_at
              ? new Date(ev.starts_at).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: ev.timezone })
              : "",
            currency: order.currency,
            totalCents: order.total_cents,
            tickets: tks.map((t) => ({
              qr_token: t.qr_token,
              typeName: (t.ticket_types as unknown as { name: string } | null)?.name ?? "Boleto",
            })),
          });
        }
      }
      break;
    }

    // Connect: la cuenta del organizador cambió de estado.
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      const enabled = Boolean(account.charges_enabled && account.payouts_enabled);
      await db
        .from("organizations")
        .update({ payouts_enabled: enabled })
        .eq("stripe_account_id", account.id);
      break;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = pi.metadata?.order_id;
      if (orderId) {
        await db.from("orders").update({ status: "failed" }).eq("id", orderId).eq("status", "pending");
        // Los holds expiran solos vía pg_cron; no tocamos quantity_sold.
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
