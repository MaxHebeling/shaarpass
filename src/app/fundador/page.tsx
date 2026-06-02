import type { Metadata } from "next";
import Link from "next/link";
import { Crown, HandHelping, Wallet, Zap, MessageCircle, BadgeCheck, ArrowRight } from "lucide-react";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Organizador Fundador — ShaarPass | Te montamos tu primer evento",
  description:
    "Sé uno de los primeros organizadores de ShaarPass: te montamos tu primer evento sin costo, la comisión más baja y transparente, pagos el mismo día y soporte directo. Cupos limitados.",
  alternates: { canonical: "/fundador" },
};

const perks = [
  { icon: HandHelping, title: "Te montamos tu primer evento", body: "Sin costo de nuestra parte. Tú nos das los datos y nosotros lo dejamos listo para vender." },
  { icon: Wallet, title: "La comisión más baja", body: "2% + $0.50 por boleto, transparente. Y los eventos gratuitos no pagan nada." },
  { icon: Zap, title: "Tu dinero el mismo día", body: "Las ventas caen en tu propia cuenta de Stripe sin retenciones ni esperas." },
  { icon: MessageCircle, title: "Soporte directo", body: "Hablas con una persona por WhatsApp, no con un bot. Te acompañamos el día del evento." },
  { icon: BadgeCheck, title: "Insignia de Fundador", body: "Tu organización aparece como Organizador Fundador y con prioridad en Descubrir." },
];

export default function FundadorPage() {
  return (
    <>
      <Nav />
      <main className="grain relative px-6 pb-24 pt-36">
        <section className="aurora relative mx-auto max-w-3xl overflow-hidden rounded-[2.5rem] border border-white/10 px-8 py-16 text-center">
          <div className="relative z-10">
            <div className="ring-grad glass mx-auto mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs text-gold">
              <Crown className="h-3.5 w-3.5" /> Programa Organizador Fundador · cupos limitados
            </div>
            <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              Sé de los primeros.
              <br />
              <span className="brand-text text-glow">Te lo montamos nosotros.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg text-muted">
              Estamos eligiendo a un grupo pequeño de organizadores para arrancar ShaarPass.
              Si entras, te acompañamos de cerca y te montamos tu primer evento sin costo.
            </p>
            <a
              href="mailto:tickets@shaarpass.io?subject=Quiero%20ser%20Organizador%20Fundador&body=Hola%2C%20me%20interesa%20el%20programa.%20Mi%20pr%C3%B3ximo%20evento%20es%3A%20%5Bnombre%2C%20fecha%2C%20lugar%5D"
              className="brand-gradient group mt-9 inline-flex items-center gap-2 rounded-full px-8 py-4 font-semibold text-ink shadow-xl shadow-fuchsia/30 transition hover:scale-[1.03]"
            >
              Quiero ser Fundador <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </a>
            <p className="mt-4 text-xs text-muted">Cuéntanos tu próximo evento y lo dejamos listo.</p>
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-4xl">
          <h2 className="mb-10 text-center font-display text-3xl font-bold">Lo que recibes</h2>
          <div className="grid gap-5 md:grid-cols-3">
            {perks.map((p) => (
              <div key={p.title} className="ring-grad lift glass rounded-3xl p-6">
                <div className="brand-gradient mb-4 grid h-12 w-12 place-items-center rounded-2xl text-ink shadow-lg shadow-fuchsia/30">
                  <p.icon className="h-5 w-5" strokeWidth={2.4} />
                </div>
                <h3 className="font-display text-lg font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Cómo entras */}
        <section className="mx-auto mt-16 max-w-2xl">
          <div className="glass ring-grad rounded-3xl p-8">
            <h2 className="font-display text-2xl font-bold">Cómo entras</h2>
            <ol className="mt-4 space-y-3 text-sm text-muted">
              <li className="flex gap-3"><span className="brand-text font-display font-bold">1.</span> Nos escribes con tu próximo evento (nombre, fecha, lugar).</li>
              <li className="flex gap-3"><span className="brand-text font-display font-bold">2.</span> Lo montamos contigo y conectamos tu cobro (10 minutos).</li>
              <li className="flex gap-3"><span className="brand-text font-display font-bold">3.</span> Compartes tu link y empiezas a vender — nosotros te acompañamos.</li>
            </ol>
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold md:text-4xl">¿Tienes un evento en puerta?</h2>
          <a
            href="mailto:tickets@shaarpass.io?subject=Quiero%20ser%20Organizador%20Fundador"
            className="brand-gradient group mt-7 inline-flex items-center gap-2 rounded-full px-8 py-4 font-semibold text-ink shadow-xl shadow-fuchsia/30 transition hover:scale-[1.03]"
          >
            Postular como Fundador <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </a>
          <p className="mt-4 text-sm text-muted">
            ¿Prefieres explorar primero? <Link href="/login" className="brand-text font-semibold">Crea tu cuenta</Link>.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
