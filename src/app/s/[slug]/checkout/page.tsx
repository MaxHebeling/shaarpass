"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Loader2, Lock, Layers, ShieldCheck } from "lucide-react";
import { getStripePromise } from "@/lib/stripe/browser";
import { createClient } from "@/lib/supabase/browser";
import { money } from "@/lib/money";

export default function SeasonCheckout() {
  const { slug } = useParams<{ slug: string }>();
  const [season, setSeason] = useState<{ id: string; title: string; price: number; currency: string } | null>(null);
  const [gone, setGone] = useState(false);
  const [email, setEmail] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idem = useRef(crypto.randomUUID());

  useEffect(() => {
    createClient().from("seasons").select("id, title, price_cents, currency").eq("slug", slug).eq("status", "published").maybeSingle()
      .then(({ data }) => {
        if (!data) { setGone(true); return; }
        setSeason({ id: data.id, title: data.title, price: data.price_cents, currency: data.currency });
      });
  }, [slug]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!season) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/season-checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: season.id, buyerEmail: email, idempotencyKey: idem.current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo iniciar el pago");
      if (!data.clientSecret) throw new Error("Falta configurar Stripe (claves de pago).");
      setClientSecret(data.clientSecret);
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }

  if (gone) return <main className="grid min-h-screen place-items-center px-6 text-center"><p className="text-muted">Este abono ya no está disponible.</p></main>;

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gold"><Layers className="h-4 w-4" /> Abono de temporada</div>
      <h1 className="font-display text-3xl font-bold">{season?.title ?? "…"}</h1>
      <div className="glass mt-6 rounded-3xl p-6">
        <div className="font-display text-3xl font-bold text-gold">{season ? money(season.price, season.currency) : "…"}</div>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><ShieldCheck className="h-3.5 w-3.5 text-gold" /> Un pago · un boleto por evento · gestión desde tu cuenta</p>

        {!clientSecret ? (
          <form onSubmit={start} className="mt-5 space-y-3">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com"
              className="w-full rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm outline-none focus:border-fuchsia/60" />
            {error && <p className="text-sm text-fuchsia">{error}</p>}
            <button disabled={loading || !season} className="brand-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-ink disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Continuar al pago
            </button>
          </form>
        ) : (
          <Elements stripe={getStripePromise()} options={{ clientSecret, appearance: { theme: "night", variables: { colorPrimary: "#d6219b" } } }}>
            <PayForm slug={slug} />
          </Elements>
        )}
      </div>
    </main>
  );
}

function PayForm({ slug }: { slug: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true); setError(null);
    const { error } = await stripe.confirmPayment({ elements, confirmParams: { return_url: `${window.location.origin}/s/${slug}/gracias` } });
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
