import { CheckCircle2 } from "lucide-react";

export const metadata = { title: "Cuenta conectada | ShaarPass", robots: { index: false } };

export default function PayoutReady() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div className="glass max-w-md rounded-3xl p-8">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
        <h1 className="mt-4 font-display text-2xl font-bold">Cuenta de cobro conectada</h1>
        <p className="mt-2 text-sm text-muted">
          Cuando tu boleto se venda, transferiremos tu dinero automáticamente. Te avisaremos por correo.
        </p>
      </div>
    </main>
  );
}
