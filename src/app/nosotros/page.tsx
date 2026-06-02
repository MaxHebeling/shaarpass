import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Eye, Zap, HeartHandshake, Lock, ArrowRight } from "lucide-react";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Sobre ShaarPass — Boletos con comisiones justas y transparentes",
  description:
    "ShaarPass nació para acabar con los fees abusivos y opacos en la venta de boletos. Comisiones bajas y claras, pagos el mismo día y soporte humano real. Conoce nuestra misión y cómo trabajamos.",
  alternates: { canonical: "/nosotros" },
};

const values = [
  { icon: Eye, title: "Transparencia primero", body: "Verás cada comisión antes de publicar y tu comprador la verá antes de pagar. Nada de cargos sorpresa al final." },
  { icon: Zap, title: "Tu dinero, rápido", body: "Las ventas llegan a tu cuenta el mismo día, no semanas después del evento. No retenemos un porcentaje de tus ventas." },
  { icon: ShieldCheck, title: "Sin reventa abusiva", body: "La reventa entre fans está topada al precio original. Protegemos a tu público del scalping." },
  { icon: HeartHandshake, title: "Soporte de personas", body: "Cuando algo importa, hablas con un humano, no con un bot que da vueltas." },
];

export default function NosotrosPage() {
  return (
    <>
      <Nav />
      <main className="grain relative px-6 pb-24 pt-36">
        <section className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight md:text-6xl">
            Boletos con <span className="brand-text text-glow">comisiones justas</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            ShaarPass nació de una frustración simple: vender boletos cuesta demasiado y nadie te explica por qué.
            Comisiones opacas, retenciones de semanas, soporte imposible y reventa que castiga a tu público.
            Construimos lo contrario.
          </p>
        </section>

        {/* Misión */}
        <section className="mx-auto mt-16 max-w-3xl">
          <div className="glass ring-grad rounded-3xl p-8">
            <h2 className="font-display text-2xl font-bold">Nuestra misión</h2>
            <p className="mt-3 leading-relaxed text-muted">
              Que cualquier persona —desde una iglesia o un colectivo local hasta un promotor de conciertos— pueda
              vender entradas con la <strong className="text-fg">comisión más baja y transparente del mercado</strong>,
              cobrar a su propia cuenta de inmediato y dar a su público una experiencia segura y sin fricción.
              Creemos que la tecnología de una gran ticketera debería estar al alcance de todos, sin sus abusos.
            </p>
          </div>
        </section>

        {/* Valores */}
        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="mb-8 text-center font-display text-3xl font-bold">En qué creemos</h2>
          <div className="grid gap-5 md:grid-cols-2">
            {values.map((v) => (
              <div key={v.title} className="ring-grad lift glass rounded-3xl p-6">
                <div className="brand-gradient mb-4 grid h-12 w-12 place-items-center rounded-2xl text-ink shadow-lg shadow-fuchsia/30">
                  <v.icon className="h-5 w-5" strokeWidth={2.4} />
                </div>
                <h3 className="font-display text-lg font-semibold">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{v.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Cómo ganamos dinero + seguridad */}
        <section className="mx-auto mt-12 max-w-3xl space-y-5">
          <div className="glass rounded-3xl p-7">
            <h2 className="font-display text-xl font-bold">Cómo ganamos dinero (sin trucos)</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Solo cobramos una comisión por boleto vendido: 2% + $0.50, más el procesamiento de pago. No vendemos
              tus datos ni los de tu público, no cobramos mensualidades y los eventos gratuitos no pagan nada.
              Si tú no vendes, nosotros no ganamos: estamos del mismo lado.
            </p>
          </div>
          <div className="glass rounded-3xl p-7">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold">
              <Lock className="h-5 w-5 text-gold" /> Pagos seguros
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Los pagos se procesan con <strong className="text-fg">Stripe</strong>, la misma infraestructura que usan
              miles de empresas en todo el mundo. Nunca almacenamos los datos de tarjeta de tus compradores, y cada
              boleto lleva un QR seguro que rota cada 15 segundos para evitar clonaciones.
            </p>
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold md:text-4xl">¿Hablamos?</h2>
          <p className="mt-3 text-muted">
            ¿Tienes un evento en puerta o quieres que te ayudemos a montarlo? Escríbenos a{" "}
            <a href="mailto:tickets@shaarpass.io" className="brand-text font-semibold">tickets@shaarpass.io</a>.
          </p>
          <Link href="/login" className="brand-gradient group mt-7 inline-flex items-center gap-2 rounded-full px-8 py-4 font-semibold text-ink shadow-xl shadow-fuchsia/30 transition hover:scale-[1.03]">
            Crear mi evento gratis <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
