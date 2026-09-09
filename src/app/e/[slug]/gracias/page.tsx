import Link from "next/link";
import { CheckCircle2, Calendar, Mail, Clock, Store } from "lucide-react";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";

function fmtWhen(iso: string, tz: string) {
  try {
    return new Date(iso).toLocaleString("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: tz || "America/Mexico_City" });
  } catch { return ""; }
}

/** Estado real de la orden a partir del PaymentIntent que Stripe agrega al volver.
 *  Para OXXO/SPEI el pago aún NO entró (ficha emitida): no afirmes "listo". */
async function orderState(paymentIntentId: string | undefined): Promise<{
  kind: "paid" | "awaiting" | "pending" | "unknown";
  method: string | null;
  voucherUrl: string | null;
}> {
  if (!paymentIntentId) return { kind: "unknown", method: null, voucherUrl: null };
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("orders")
      .select("status, payment_method, voucher_url")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle();
    if (!data) return { kind: "unknown", method: null, voucherUrl: null };
    const method = (data.payment_method as string | null) ?? null;
    const voucherUrl = (data.voucher_url as string | null) ?? null;
    if (data.status === "paid") return { kind: "paid", method, voucherUrl };
    if (data.status === "awaiting_payment") return { kind: "awaiting", method, voucherUrl };
    if (data.status === "pending") return { kind: "pending", method, voucherUrl };
    return { kind: "unknown", method, voucherUrl };
  } catch {
    return { kind: "unknown", method: null, voucherUrl: null };
  }
}

export default async function GraciasPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ payment_intent?: string; redirect_status?: string }>;
}) {
  const { slug } = await params;
  const { payment_intent } = await searchParams;
  const db = createPublicClient();
  const { data: event } = await db
    .from("events")
    .select("title, cover_image, starts_at, timezone")
    .eq("slug", slug)
    .maybeSingle();

  const state = await orderState(payment_intent);
  // "awaiting" = ficha OXXO/SPEI emitida, esperando el pago. "pending" puede ser una
  // carrera con el webhook (ficha recién emitida) → mensaje neutro no-triunfalista.
  const async = state.kind === "awaiting" || state.kind === "pending";
  const methodLabel = state.method === "spei" ? "SPEI" : "OXXO";

  return (
    <main className="aurora relative grid min-h-screen place-items-center px-5 py-12 text-center">
      <div className="relative z-10 w-full max-w-md">
        <div className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl text-ink shadow-xl ${async ? "bg-gold shadow-gold/30" : "brand-gradient shadow-fuchsia/30"}`}>
          {async ? <Clock className="h-8 w-8" strokeWidth={2.4} /> : <CheckCircle2 className="h-8 w-8" strokeWidth={2.4} />}
        </div>

        {async ? (
          <>
            <h1 className="mt-6 font-display text-3xl font-bold sm:text-4xl">Falta un paso 🧾</h1>
            <p className="mx-auto mt-3 max-w-sm text-muted">
              Generamos tu {state.method === "spei" ? "referencia SPEI" : "ficha de pago OXXO"}. Tu compra queda
              apartada; <span className="text-fg">te enviaremos los boletos por correo en cuanto se confirme el pago</span>{" "}
              (unos minutos después de pagar).
            </p>
            {state.voucherUrl && (
              <a
                href={state.voucherUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="brand-gradient mt-5 inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-ink transition hover:scale-[1.02]"
              >
                <Store className="h-4 w-4" /> Ver mi {methodLabel === "SPEI" ? "referencia" : "ficha"} de pago
              </a>
            )}
          </>
        ) : (
          <>
            <h1 className="mt-6 font-display text-3xl font-bold sm:text-4xl">¡Listo! 🎉</h1>
            <p className="mx-auto mt-3 max-w-sm text-muted">
              Tu compra se procesó. Te enviamos los boletos con su código QR a tu correo.
            </p>
          </>
        )}

        {/* Sección visual del evento */}
        {event && (
          <div className="glass mt-7 overflow-hidden rounded-3xl text-left">
            {event.cover_image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.cover_image} alt={event.title} className="aspect-[16/9] w-full object-cover" />
            )}
            <div className="p-5">
              <div className="font-display text-lg font-semibold leading-tight">{event.title}</div>
              {event.starts_at && (
                <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span className="capitalize">{fmtWhen(event.starts_at, event.timezone)}</span>
                </div>
              )}
              <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-surface/60 px-3 py-2 text-xs text-muted">
                <Mail className="h-3.5 w-3.5 shrink-0 text-gold" />
                {async
                  ? `Cuando pagues en ${methodLabel}, tu QR y el botón “Ver mi boleto” llegan a tu correo.`
                  : "Revisa tu correo: ahí está tu QR y el botón “Ver mi boleto”."}
              </div>
            </div>
          </div>
        )}

        <Link href={`/e/${slug}`} className="brand-text mt-7 inline-block font-semibold">
          Ver diseño del evento →
        </Link>
      </div>
    </main>
  );
}
