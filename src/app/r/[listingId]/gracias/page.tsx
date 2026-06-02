import { CheckCircle2 } from "lucide-react";

export default function ResaleGracias() {
  return (
    <main className="aurora relative grid min-h-screen place-items-center px-6 text-center">
      <div className="relative z-10 max-w-md">
        <div className="brand-gradient mx-auto grid h-16 w-16 place-items-center rounded-2xl text-ink shadow-xl shadow-fuchsia/30">
          <CheckCircle2 className="h-8 w-8" strokeWidth={2.4} />
        </div>
        <h1 className="mt-6 font-display text-4xl font-bold">¡Listo! 🎉</h1>
        <p className="mt-3 text-muted">Compraste el boleto en reventa. Te enviamos tu boleto seguro por correo — el QR quedó reemitido a tu nombre.</p>
      </div>
    </main>
  );
}
