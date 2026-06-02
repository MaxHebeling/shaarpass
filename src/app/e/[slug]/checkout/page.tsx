"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { ArrowLeft, Loader2, ShieldCheck, Lock } from "lucide-react";
import { getStripePromise } from "@/lib/stripe/browser";
import { createClient } from "@/lib/supabase/browser";
import { money } from "@/lib/money";
import { ourFeeCents } from "@/lib/ticketing/feeMath";

interface CartItem { ticketTypeId: string; name: string; price_cents: number; quantity: number; seatIds?: string[]; eventSeatIds?: string[]; seatLabels?: string[]; }
interface Cart { eventId: string; eventSlug: string; currency: string; items: CartItem[]; }
interface Service { id: string; name: string; kind: string; price_cents: number; max_per_order: number; }

const KIND_EMOJI: Record<string, string> = { food: "🍔", drink: "🥤", parking: "🅿️", merch: "👕", vip: "⭐", access: "🎟️", extra: "✨" };

export default function CheckoutPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [email, setEmail] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Promo
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<{ code: string; discount: number } | null>(null);
  const [promoMsg, setPromoMsg] = useState<string | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  // Servicios/extras
  const [services, setServices] = useState<Service[]>([]);
  const [svcQty, setSvcQty] = useState<Record<string, number>>({});

  useEffect(() => {
    const raw = sessionStorage.getItem(`cart:${slug}`);
    if (raw) setCart(JSON.parse(raw));
  }, [slug]);

  useEffect(() => {
    if (!cart) return;
    createClient()
      .from("services").select("id, name, kind, price_cents, max_per_order")
      .eq("event_id", cart.eventId).eq("active", true)
      .then(({ data }) => setServices(data ?? []));
  }, [cart]);

  const totals = useMemo(() => {
    if (!cart) return { count: 0, gross: 0, discount: 0, subtotal: 0, fee: 0, servicesTotal: 0, total: 0 };
    const count = cart.items.reduce((s, i) => s + i.quantity, 0);
    const gross = cart.items.reduce((s, i) => s + i.price_cents * i.quantity, 0);
    const discount = Math.min(promo?.discount ?? 0, gross);
    const subtotal = Math.max(0, gross - discount);
    const fee = ourFeeCents(subtotal, count);
    const servicesTotal = services.reduce((s, sv) => s + sv.price_cents * (svcQty[sv.id] ?? 0), 0);
    return { count, gross, discount, subtotal, fee, servicesTotal, total: subtotal + fee + servicesTotal };
  }, [cart, promo, services, svcQty]);

  async function applyPromo() {
    if (!cart || !promoInput.trim()) return;
    setPromoLoading(true);
    setPromoMsg(null);
    try {
      const res = await fetch("/api/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: cart.eventId, code: promoInput.trim(), subtotalCents: totals.gross }),
      });
      const data = await res.json();
      if (data.valid) {
        setPromo({ code: promoInput.trim().toUpperCase(), discount: data.discountCents });
        setPromoMsg("¡Código aplicado!");
      } else {
        setPromo(null);
        setPromoMsg(data.message ?? "Código no válido");
      }
    } catch {
      setPromoMsg("No se pudo validar el código");
    } finally {
      setPromoLoading(false);
    }
  }

  async function startPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!cart) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: cart.eventId,
          buyerEmail: email,
          sessionId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          promoCode: promo?.code,
          items: cart.items.map((i) => ({ ticketTypeId: i.ticketTypeId, quantity: i.quantity, seatIds: i.seatIds, eventSeatIds: i.eventSeatIds })),
          services: services.filter((s) => (svcQty[s.id] ?? 0) > 0).map((s) => ({ serviceId: s.id, quantity: svcQty[s.id] })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "No se pudo iniciar el pago");
      if (!data.clientSecret) throw new Error("Falta configurar Stripe (claves de pago).");
      setClientSecret(data.clientSecret);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!cart || cart.items.length === 0) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <p className="text-muted">Tu carrito está vacío.</p>
          <Link href={`/e/${slug}`} className="brand-text mt-2 inline-block font-semibold">Volver al evento →</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <button onClick={() => router.push(`/e/${slug}`)} className="mb-6 flex items-center gap-2 text-sm text-muted transition hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Volver al evento
      </button>

      <h1 className="font-display text-3xl font-bold">Finaliza tu compra</h1>

      {/* Resumen */}
      <div className="glass mt-6 rounded-3xl p-6">
        {cart.items.map((i) => (
          <div key={i.ticketTypeId} className="flex justify-between py-1.5 text-sm">
            <span className="text-muted">
              {i.quantity}× {i.name}
              {i.seatLabels?.length ? <span className="block text-[11px] text-muted/70">{i.seatLabels.join(" · ")}</span> : null}
            </span>
            <span>{money(i.price_cents * i.quantity, cart.currency)}</span>
          </div>
        ))}
        <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
          <div className="flex justify-between text-muted"><span>Subtotal</span><span>{money(totals.gross, cart.currency)}</span></div>
          {totals.discount > 0 && (
            <div className="flex justify-between text-emerald-300">
              <span>Descuento {promo?.code ? `(${promo.code})` : ""}</span>
              <span>−{money(totals.discount, cart.currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-muted">
            <span>Comisión de servicio <span className="text-[11px]">(2% + $0.50/boleto)</span></span>
            <span>{money(totals.fee, cart.currency)}</span>
          </div>
          {totals.servicesTotal > 0 && (
            <div className="flex justify-between text-muted"><span>Extras</span><span>{money(totals.servicesTotal, cart.currency)}</span></div>
          )}
          <div className="flex justify-between font-display text-lg font-bold">
            <span>Total</span><span className="text-gold">{money(totals.total, cart.currency)}</span>
          </div>
        </div>

        {/* Extras / servicios */}
        {!clientSecret && services.length > 0 && (
          <div className="mt-4 border-t border-line pt-4">
            <div className="mb-2 text-sm font-medium">Agrega extras</div>
            <div className="space-y-2">
              {services.map((s) => {
                const n = svcQty[s.id] ?? 0;
                return (
                  <div key={s.id} className="flex items-center justify-between rounded-xl border border-line bg-surface/40 px-3 py-2 text-sm">
                    <span>{KIND_EMOJI[s.kind] ?? "✨"} {s.name} <span className="text-gold">{money(s.price_cents, cart.currency)}</span></span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setSvcQty((q) => ({ ...q, [s.id]: Math.max(0, n - 1) }))} disabled={n === 0}
                        className="grid h-7 w-7 place-items-center rounded-full border border-line disabled:opacity-30">−</button>
                      <span className="w-5 text-center tabular-nums">{n}</span>
                      <button type="button" onClick={() => setSvcQty((q) => ({ ...q, [s.id]: Math.min(s.max_per_order, n + 1) }))} disabled={n >= s.max_per_order}
                        className="brand-gradient grid h-7 w-7 place-items-center rounded-full text-ink disabled:opacity-30">+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Promo code */}
        {!clientSecret && (
          <div className="mt-4 border-t border-line pt-4">
            <div className="flex gap-2">
              <input
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                placeholder="¿Tienes un código?"
                className="flex-1 rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm uppercase outline-none focus:border-fuchsia/60"
              />
              <button
                type="button" onClick={applyPromo} disabled={promoLoading || !promoInput.trim()}
                className="glass rounded-xl px-4 text-sm font-semibold transition hover:border-white/20 disabled:opacity-50"
              >
                {promoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar"}
              </button>
            </div>
            {promoMsg && <p className={`mt-2 text-xs ${promo ? "text-emerald-300" : "text-fuchsia"}`}>{promoMsg}</p>}
          </div>
        )}
      </div>

      {/* Paso email → pago */}
      {!clientSecret ? (
        <form onSubmit={startPayment} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-muted">Correo (te enviaremos los boletos)</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="w-full rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm outline-none focus:border-fuchsia/60"
            />
          </div>
          {error && <p className="text-sm text-fuchsia">{error}</p>}
          <button
            type="submit" disabled={loading}
            className="brand-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-ink transition hover:scale-[1.01] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Continuar al pago seguro
          </button>
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-gold" /> Boletos reservados 10 min mientras pagas
          </p>
        </form>
      ) : (
        <Elements stripe={getStripePromise()} options={{ clientSecret, appearance: { theme: "night", variables: { colorPrimary: "#d6219b" } } }}>
          <PayForm slug={slug} total={money(totals.total, cart.currency)} />
        </Elements>
      )}
    </main>
  );
}

function PayForm({ slug, total }: { slug: string; total: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/e/${slug}/gracias` },
    });
    if (error) { setError(error.message ?? "Error al procesar el pago"); setLoading(false); }
  }

  return (
    <form onSubmit={pay} className="mt-6 space-y-4">
      <div className="glass rounded-3xl p-6">
        <PaymentElement />
      </div>
      {error && <p className="text-sm text-fuchsia">{error}</p>}
      <button
        type="submit" disabled={!stripe || loading}
        className="brand-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-ink transition hover:scale-[1.01] disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
        Pagar {total}
      </button>
    </form>
  );
}
