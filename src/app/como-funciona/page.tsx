import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus, CreditCard, CalendarPlus, Share2, ScanLine, Banknote, Ticket, QrCode, DoorOpen, ArrowRight } from "lucide-react";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Cómo funciona ShaarPass — Vende boletos en minutos",
  description:
    "Crea tu cuenta, conecta tu cobro y publica tu evento en minutos. Así funciona ShaarPass para organizadores y para quienes compran boletos: QR seguro, pagos el mismo día y check-in sin internet.",
  alternates: { canonical: "/como-funciona" },
};

const organizer = [
  { icon: UserPlus, title: "Crea tu cuenta", body: "Te registras gratis con tu correo. Sin invitaciones ni aprobaciones." },
  { icon: CreditCard, title: "Conecta tu cobro", body: "Vinculas tu cuenta de Stripe una sola vez. El dinero de tus ventas cae directo en tu cuenta." },
  { icon: CalendarPlus, title: "Publica tu evento", body: "Defines tipos de boleto, precios y fecha en minutos. Publicar es gratis." },
  { icon: Share2, title: "Comparte y vende", body: "Compartes el link de tu evento. También aparece en Descubrir y en búsquedas." },
  { icon: ScanLine, title: "Recibe a tu público", body: "Escaneas el QR desde el teléfono, incluso sin internet. Sincroniza al reconectar." },
  { icon: Banknote, title: "Cobra al instante", body: "El dinero llega a tu cuenta el mismo día. Sin retenciones del 20%." },
];

const attendee = [
  { icon: Ticket, title: "Compra sin cuenta", body: "Eliges tus boletos y pagas con tarjeta. No necesitas registrarte." },
  { icon: QrCode, title: "Recibe tu QR seguro", body: "Tu boleto llega por correo con un QR que rota cada 15 segundos, imposible de clonar." },
  { icon: DoorOpen, title: "Entra al evento", body: "Muestras el QR en la entrada. Si no puedes ir, lo transfieres o revendes a precio justo." },
];

export default function ComoFuncionaPage() {
  return (
    <>
      <Nav />
      <main className="grain relative px-6 pb-24 pt-36">
        <section className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight md:text-6xl">
            Cómo funciona <span className="brand-text text-glow">ShaarPass</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
            Vender boletos no tiene que ser complicado ni caro. Esto es todo lo que toma.
          </p>
        </section>

        {/* Organizadores */}
        <section className="mx-auto mt-16 max-w-5xl">
          <p className="mb-2 text-center text-sm uppercase tracking-[0.2em] text-muted">Para organizadores</p>
          <h2 className="mb-10 text-center font-display text-3xl font-bold">De idea a venta en 6 pasos</h2>
          <div className="grid gap-5 md:grid-cols-3">
            {organizer.map((s, i) => (
              <div key={s.title} className="ring-grad lift glass relative rounded-3xl p-6">
                <span className="absolute right-5 top-5 font-display text-3xl font-bold text-white/10">{String(i + 1).padStart(2, "0")}</span>
                <div className="brand-gradient mb-4 grid h-12 w-12 place-items-center rounded-2xl text-ink shadow-lg shadow-fuchsia/30">
                  <s.icon className="h-5 w-5" strokeWidth={2.4} />
                </div>
                <h3 className="font-display text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Asistentes */}
        <section className="mx-auto mt-20 max-w-4xl">
          <p className="mb-2 text-center text-sm uppercase tracking-[0.2em] text-muted">Para quien compra</p>
          <h2 className="mb-10 text-center font-display text-3xl font-bold">Comprar es de 3 toques</h2>
          <div className="grid gap-5 md:grid-cols-3">
            {attendee.map((s) => (
              <div key={s.title} className="ring-grad lift glass rounded-3xl p-6">
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-surface text-gold">
                  <s.icon className="h-5 w-5" strokeWidth={2.4} />
                </div>
                <h3 className="font-display text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold md:text-4xl">Publica tu primer evento hoy</h2>
          <p className="mt-3 text-muted">Gratis, sin tarjeta y sin mensualidad.</p>
          <Link href="/login" className="brand-gradient group mt-7 inline-flex items-center gap-2 rounded-full px-8 py-4 font-semibold text-ink shadow-xl shadow-fuchsia/30 transition hover:scale-[1.03]">
            Crear mi evento gratis <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
