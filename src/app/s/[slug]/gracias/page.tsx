import { CheckCircle2, Mail } from "lucide-react";

export const dynamic = "force-dynamic";

export default function SeasonThanks() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div className="glass max-w-md rounded-3xl p-8">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
        <h1 className="mt-4 font-display text-2xl font-bold">¡Abono confirmado!</h1>
        <p className="mt-2 text-sm text-muted">
          Te enviamos por correo el enlace a tu cuenta, donde puedes ver y gestionar todos los boletos de tu abono.
        </p>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
          <Mail className="h-3.5 w-3.5 text-gold" /> Revisa tu bandeja de entrada (y spam).
        </p>
      </div>
    </main>
  );
}
