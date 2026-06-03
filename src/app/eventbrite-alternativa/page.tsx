import type { Metadata } from "next";
import Link from "next/link";
import { Check, X, ArrowRight } from "lucide-react";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "La alternativa a Eventbrite en español — ShaarPass",
  description:
    "ShaarPass es la alternativa a Eventbrite con la comisión más baja y transparente (2% + $0.50), pagos el mismo día, soporte humano en español y boletos con QR anti-reventa. Compara y cámbiate.",
  alternates: { canonical: "/eventbrite-alternativa" },
};

// Comparativa (referencial; tarifas públicas de cada plataforma).
const rows: { label: string; shaar: boolean | string; eb: boolean | string }[] = [
  { label: "Comisión por boleto", shaar: "2% + $0.50", eb: "~6.99% + IVA" },
  { label: "Comisión visible antes de pagar", shaar: true, eb: "Parcial" },
  { label: "Eventos gratuitos sin comisión", shaar: true, eb: "Variable" },
  { label: "Pagos a tu cuenta el mismo día", shaar: true, eb: false },
  { label: "Soporte humano en español", shaar: true, eb: false },
  { label: "QR seguro que rota (anti-reventa)", shaar: true, eb: false },
  { label: "Reventa topada al precio original", shaar: true, eb: false },
  { label: "Marca blanca (tu logo, tu color)", shaar: true, eb: false },
  { label: "Cola virtual y anti-bot para alta demanda", shaar: true, eb: false },
];

const faqs = [
  { q: "¿ShaarPass es más barato que Eventbrite?", a: "Sí. ShaarPass cobra 2% + $0.50 por boleto más el procesamiento de pago, mientras que Eventbrite cobra alrededor de 6.99% + IVA por boleto pagado. En la mayoría de los eventos te quedas con más dinero con ShaarPass, y los eventos gratuitos no pagan comisión." },
  { q: "¿Puedo migrar mi evento de Eventbrite a ShaarPass?", a: "Sí. Creas tu evento en ShaarPass en minutos, defines tus boletos y precios, conectas tu cuenta de cobro y compartes tu nuevo enlace. Si quieres, te ayudamos a montarlo." },
  { q: "¿Cuándo recibo el dinero de mis ventas?", a: "El dinero de tus ventas llega a tu propia cuenta de Stripe el mismo día, no semanas después del evento. ShaarPass no retiene un porcentaje de tus ventas." },
  { q: "¿ShaarPass funciona en México y para eventos en español?", a: "Sí. ShaarPass está hecho en español, soporta monedas como el peso mexicano y está pensado para organizadores en México y Latinoamérica: iglesias, conferencias, conciertos y eventos locales." },
];

const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">{children}</h2>
);

export default function EventbriteAlternativaPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <>
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <main className="grain relative px-6 pb-24 pt-36">
        <section className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight md:text-6xl">
            La alternativa a <span className="brand-text text-glow">Eventbrite</span> en español
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            ShaarPass es una plataforma para vender boletos pensada para que <strong className="text-fg">te
            quedes con más de cada venta</strong>: comisión baja y transparente, pagos el mismo día, soporte
            humano en español y boletos con QR seguro. Si Eventbrite se queda con demasiado de tu evento, esta
            es tu salida.
          </p>
          <Link href="/login" className="brand-gradient group mt-8 inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-semibold text-ink shadow-xl shadow-fuchsia/30 transition hover:scale-[1.03]">
            Crea tu evento gratis <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
        </section>

        {/* Comparativa */}
        <section className="mx-auto mt-16 max-w-3xl">
          <H>ShaarPass vs. Eventbrite</H>
          <div className="glass mt-6 overflow-hidden rounded-3xl">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="px-4 py-4 font-medium"> </th>
                  <th className="px-4 py-4 font-display font-bold text-gold">ShaarPass</th>
                  <th className="px-4 py-4 font-medium">Eventbrite</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3.5 text-muted">{r.label}</td>
                    <td className="px-4 py-3.5">{cell(r.shaar, true)}</td>
                    <td className="px-4 py-3.5">{cell(r.eb, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-center text-xs text-muted">
            Comparación referencial con tarifas públicas de Eventbrite (~6.99% + IVA por boleto pagado, según su
            página de precios). El procesamiento de pago lo cobra la pasarela y varía por país.
          </p>
        </section>

        {/* Por qué cambiarse */}
        <section className="mx-auto mt-16 max-w-3xl">
          <H>Por qué los organizadores se cambian</H>
          <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-muted">
            <p><strong className="text-fg">Te quedas con más.</strong> En un evento de 200 boletos a $250, la diferencia entre una comisión de ~7% y una de 2% + $0.50 son cientos o miles de pesos que se quedan en tu bolsa, no en la plataforma.</p>
            <p><strong className="text-fg">Cobras el mismo día.</strong> No esperas a que termine el evento ni a un calendario de pagos: el dinero llega a tu cuenta de inmediato.</p>
            <p><strong className="text-fg">Te contesta una persona.</strong> Soporte real en español, antes y durante tu evento — no un bot que te manda a un artículo de ayuda.</p>
            <p><strong className="text-fg">Proteges a tu público.</strong> QR seguro que rota cada 15 segundos y reventa topada al precio original: sin clonaciones ni coyotaje.</p>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto mt-16 max-w-3xl">
          <H>Preguntas frecuentes</H>
          <div className="mt-6 space-y-4">
            {faqs.map((f) => (
              <div key={f.q} className="glass rounded-2xl p-5">
                <h3 className="font-medium text-fg">{f.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-2xl text-center">
          <H>Cámbiate hoy</H>
          <p className="mt-3 text-muted">Publicar es gratis. Sin tarjeta, sin mensualidad.</p>
          <Link href="/login" className="brand-gradient group mt-7 inline-flex items-center gap-2 rounded-full px-8 py-4 font-semibold text-ink shadow-xl shadow-fuchsia/30 transition hover:scale-[1.03]">
            Crear mi evento gratis <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
          <p className="mt-4 text-sm text-muted">
            ¿Tienes dudas? <Link href="/precios" className="brand-text">Ver precios</Link> ·{" "}
            <Link href="/como-funciona" className="brand-text">Cómo funciona</Link>
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}

function cell(v: boolean | string, good: boolean) {
  if (v === true) return <Check className="h-5 w-5 text-emerald-400" />;
  if (v === false) return <X className="h-5 w-5 text-muted/50" />;
  return <span className={good ? "font-medium text-fg" : "text-muted"}>{v}</span>;
}
