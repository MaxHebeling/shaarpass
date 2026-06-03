import { MailOpen } from "lucide-react";
import { LeadForm } from "@/components/marketing/LeadForm";

export function LeadCapture() {
  return (
    <section className="relative px-6 py-20">
      <div className="glass ring-grad mx-auto max-w-3xl rounded-3xl p-8 md:p-10">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gold">
          <MailOpen className="h-4 w-4" /> ¿Aún no estás listo?
        </div>
        <h2 className="font-display text-3xl font-bold tracking-tight">
          Déjanos tu correo y <span className="brand-text">te ayudamos a montar tu evento</span>
        </h2>
        <p className="mt-3 max-w-xl text-sm text-muted">
          Cuéntanos qué evento tienes en puerta y te contactamos para dejártelo listo — sin compromiso.
        </p>
        <div className="mt-6">
          <LeadForm source="landing" />
        </div>
      </div>
    </section>
  );
}
