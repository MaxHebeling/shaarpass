import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default async function GraciasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main className="aurora relative grid min-h-screen place-items-center px-6 text-center">
      <div className="relative z-10 max-w-md">
        <div className="brand-gradient mx-auto grid h-16 w-16 place-items-center rounded-2xl text-ink shadow-xl shadow-fuchsia/30">
          <CheckCircle2 className="h-8 w-8" strokeWidth={2.4} />
        </div>
        <h1 className="mt-6 font-display text-4xl font-bold">¡Listo! 🎉</h1>
        <p className="mt-3 text-muted">
          Tu pago se procesó. Te enviamos los boletos con su código QR a tu correo.
          Preséntalos en la entrada del evento.
        </p>
        <Link href={`/e/${slug}`} className="brand-text mt-6 inline-block font-semibold">
          Volver al evento →
        </Link>
      </div>
    </main>
  );
}
