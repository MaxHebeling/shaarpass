"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Loader2, Lock, Repeat2, ShieldCheck } from "lucide-react";
import { getStripePromise } from "@/lib/stripe/browser";
import { createClient } from "@/lib/supabase/browser";
import { money } from "@/lib/money";
import { resaleBuyerTotal } from "@/lib/ticketing/feeMath";

export default function ResaleCheckout() {
  const { listingId } = useParams<{ listingId: string }>();
  const [listing, setListing] = useState<{ price: number; currency: string } | null>(null);
  const [gone, setGone] = useState(false);
  const [email, setEmail] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idem = useRef(crypto.randomUUID());

  useEffect(() => {
    createClient().from("listings").select("price_cents, events(currency)").eq("id", listingId).eq("status", "active").maybeSingle()
      .then(({ data }) => {
        if (!data) { setGone(true); return; }
        setListing({ price: data.price_cents, currency: (data.events as unknown as { currency: string } | null)?.currency ?? "usd" });
      });
  }, [listingId]);

  const total = listing ? resaleBuyerTotal(listing.price, listing.currency) : 0;

  async function start(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      const res = await fetch("/api/resale/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId, buyerEmail: email, idempotencyKey: idem.current }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo iniciar el pago");
      if (!data.clientSecret) throw new Error("Falta configurar Stripe (claves de pago).");
      setClientSecret(data.clientSecret);
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }

  if (gone) return <main className="grid min-h-screen place-items-center px-6 text-center"><p className="text-muted">Esta reventa ya no está disponible.</p></main>;

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="font-display text-3xl font-bold">Reventa a precio justo</h1>
      <div className="glass mt-6 rounded-3xl p-6">
        <div className="flex items-center gap-2 text-sm text-emerald-300"><Repeat2 className="h-4 w-4" /> Boleto de otro fan</div>
        <div className="mt-2 font-display text-3xl font-bold text-gold">{listing ? money(total, listing.currency) : "…"}</div>
        {listing && (
          <p className="mt-1 text-xs text-muted">
            Boleto {money(listing.price, listing.currency)} + procesamiento de pago
          </p>
        )}
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><ShieldCheck className="h-3.5 w-3.5 text-gold" /> Topado al precio original · QR reemitido a tu nombre</p>

        {!clientSecret ? (
          <form onSubmit={start} className="mt-5 space-y-3">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com"
              className="w-full rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm outline-none focus:border-fuchsia/60" />
            {error && <p className="text-sm text-fuchsia">{error}</p>}
            <button disabled={loading} className="brand-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-ink disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Continuar al pago
            </button>
          </form>
        ) : (
          <Elements stripe={getStripePromise()} options={{ clientSecret, appearance: { theme: "night", variables: { colorPrimary: "#d6219b" } } }}>
            <PayForm listingId={listingId} />
          </Elements>
        )}
      </div>
    </main>
  );
}

function PayForm({ listingId }: { listingId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true); setError(null);
    const { error } = await stripe.confirmPayment({ elements, confirmParams: { return_url: `${window.location.origin}/r/${listingId}/gracias` } });
    if (error) { setError(error.message ?? "Error al pagar"); setLoading(false); }
  }
  return (
    <form onSubmit={pay} className="mt-5 space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-fuchsia">{error}</p>}
      <button disabled={!stripe || loading} className="brand-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-ink disabled:opacity-50">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Pagar
      </button>
      <p className="text-center text-[11px] text-muted">
        Al pagar aceptas los <a href="/terminos" target="_blank" className="underline">Términos</a> y la{" "}
        <a href="/privacidad" target="_blank" className="underline">Privacidad</a>.
      </p>
    </form>
  );
}
