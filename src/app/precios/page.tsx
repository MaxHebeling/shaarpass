import type { Metadata } from "next";
import Link from "next/link";
import { Check, X, ArrowRight, Wallet, Sparkles } from "lucide-react";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";
import { FeeComparator } from "@/components/landing/FeeComparator";

export const metadata: Metadata = {
  title: "Precios y comisiones — ShaarPass | Vender boletos en México sin letra chica",
  description:
    "2% + $0.50 MXN por boleto, más el procesamiento de la pasarela trasladado al costo. Recibes el 100% del precio el mismo día, eventos gratis sin comisión y reventa topada. Calcula tu caso en pesos.",
  alternates: { canonical: "/precios" },
};

const included = [
  "Página de evento lista para vender",
  "Boletos con QR seguro (rota cada 15s)",
  "Pagos a tu cuenta el mismo día",
  "Check-in desde el teléfono, incluso sin internet",
  "Cola virtual y anti-bot para alta demanda",
  "Mapas de recinto y asientos numerados",
  "Reventa entre fans topada al precio original",
  "Abonos de temporada",
  "Códigos de descuento y campañas de email",
  "Soporte humano real",
];

const rows: { label: string; shaar: string; eb: string; tm: string }[] = [
  { label: "Comisión de plataforma", shaar: "2% + $0.50 MXN", eb: "3.99% de servicio", tm: "Opaca (alta)" },
  { label: "Procesamiento de pago", shaar: "Al costo (3.6% + $3), sin margen encima", eb: "2% propio", tm: "Opaco" },
  { label: "Transparencia del fee", shaar: "Desglosado antes de pagar", eb: "Parcial", tm: "Cargos ocultos" },
  { label: "Eventos gratuitos", shaar: "$0", eb: "Sin comisión", tm: "—" },
  { label: "Recibes tu dinero", shaar: "Mismo día", eb: "Tras el evento", tm: "Tras el evento" },
  { label: "Anti-reventa abusiva", shaar: "Sí (tope al precio original)", eb: "Limitado", tm: "Cobra en ambos lados" },
  { label: "Soporte humano", shaar: "Sí", eb: "Difícil", tm: "Difícil" },
];

export default function PreciosPage() {
  return (
    <>
      <Nav />
      <main className="grain relative px-6 pb-24 pt-36">
        <section className="mx-auto max-w-3xl text-center">
          <div className="ring-grad glass mx-auto mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs text-muted">
            <Wallet className="h-3.5 w-3.5 text-gold" /> Precios honestos
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight md:text-6xl">
            Las cuentas, <span className="brand-text text-glow">claras.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
            Cobramos <strong className="text-fg">2% + $0.50 MXN por boleto</strong>. El procesamiento de pago
            lo cobra la pasarela y te lo trasladamos <strong className="text-fg">al costo, sin margen encima</strong> —
            desglosado antes de publicar. Tú recibes el <strong className="text-fg">100% del precio de tu boleto,
            el mismo día</strong>. Los eventos gratuitos no pagan comisión.
          </p>
          <Link href="/login" className="brand-gradient group mt-8 inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-semibold text-ink shadow-xl shadow-fuchsia/30 transition hover:scale-[1.03]">
            Crea tu evento gratis <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
        </section>

        {/* Comparador interactivo */}
        <FeeComparator />

        {/* Qué incluye */}
        <section className="mx-auto mt-8 max-w-3xl">
          <h2 className="mb-6 text-center font-display text-3xl font-bold">Todo incluido, sin planes</h2>
          <div className="glass ring-grad grid gap-3 rounded-3xl p-7 sm:grid-cols-2">
            {included.map((f) => (
              <div key={f} className="flex items-center gap-2.5 text-sm">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                </span>
                {f}
              </div>
            ))}
          </div>
        </section>

        {/* Comparativa */}
        <section className="mx-auto mt-16 max-w-4xl">
          <h2 className="mb-8 text-center font-display text-3xl font-bold">
            ShaarPass vs. <span className="brand-text">el resto</span>
          </h2>
          <div className="glass overflow-hidden rounded-3xl">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="px-4 py-4 font-medium"> </th>
                  <th className="px-4 py-4 font-display font-bold text-gold">ShaarPass</th>
                  <th className="px-4 py-4 font-medium">Eventbrite</th>
                  <th className="px-4 py-4 font-medium">Ticketmaster</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-4 text-muted">{r.label}</td>
                    <td className="px-4 py-4 font-medium text-fg">{r.shaar}</td>
                    <td className="px-4 py-4 text-muted">{r.eb}</td>
                    <td className="px-4 py-4 text-muted">{r.tm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-center text-xs leading-relaxed text-muted">
            Comparación referencial con las tarifas publicadas por cada plataforma para México, a la fecha de esta página.
            Nuestra cifra incluye el costo real de la pasarela; el 2% de procesamiento de Eventbrite es interno y no
            equivale al costo de una pasarela mexicana. En boletos de precio bajo su tarifa publicada puede salir menor —
            preferimos que lo compruebes en la calculadora de arriba antes que esconderlo.
          </p>
        </section>

        <section className="mx-auto mt-20 max-w-2xl text-center">
          <Sparkles className="mx-auto mb-4 h-8 w-8 text-gold" />
          <h2 className="font-display text-3xl font-bold md:text-4xl">¿Listo para quedarte con más?</h2>
          <Link href="/login" className="brand-gradient group mt-7 inline-flex items-center gap-2 rounded-full px-8 py-4 font-semibold text-ink shadow-xl shadow-fuchsia/30 transition hover:scale-[1.03]">
            Crear mi evento gratis <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
