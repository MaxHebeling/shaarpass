import Link from "next/link";
import { CheckCircle2, Circle, Sparkles, ArrowRight } from "lucide-react";

interface Step {
  label: string;
  hint: string;
  done: boolean;
  href: string;
  cta: string;
  optional?: boolean;
}

export interface OnboardingProps {
  hasEvent: boolean;
  hasTickets: boolean;
  hasCover: boolean;
  payoutsEnabled: boolean;
  hasPublished: boolean;
  manageHref: string | null;   // página de gestión del primer evento (o null si no hay)
}

export function OnboardingChecklist({ hasEvent, hasTickets, hasCover, payoutsEnabled, hasPublished, manageHref }: OnboardingProps) {
  const create = "/dashboard/new";
  const manage = manageHref ?? create;

  const steps: Step[] = [
    { label: "Crea tu primer evento", hint: "Nombre, fecha, lugar y zona horaria.", done: hasEvent, href: create, cta: "Crear evento" },
    { label: "Agrega tus boletos", hint: "Define tipos, precios y cantidades. (Gratis = $0, sin comisión).", done: hasTickets, href: manage, cta: "Agregar boletos" },
    { label: "Sube una imagen de portada", hint: "Una buena imagen vende. Se usa en la página y al compartir.", done: hasCover, href: manage, cta: "Subir portada" },
    { label: "Conecta tus pagos", hint: "Necesario solo para eventos de pago. Los gratuitos no lo requieren.", done: payoutsEnabled, href: "/dashboard/pagos", cta: "Conectar pagos", optional: true },
    { label: "Publica y comparte", hint: "Publica tu evento y comparte el enlace por WhatsApp y redes.", done: hasPublished, href: manage, cta: "Publicar evento" },
  ];

  const core = steps.filter((s) => !s.optional);
  const doneCount = core.filter((s) => s.done).length;
  const pct = Math.round((doneCount / core.length) * 100);
  // Siguiente paso pendiente (resaltado).
  const nextIdx = steps.findIndex((s) => !s.done);

  return (
    <div className="glass ring-grad mb-8 rounded-3xl p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-gold" />
          <h2 className="font-display text-lg font-semibold">Primeros pasos</h2>
        </div>
        <span className="text-sm text-muted">{doneCount} de {core.length} listos</span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="brand-gradient h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-5 space-y-2">
        {steps.map((s, i) => {
          const isNext = i === nextIdx;
          return (
            <div key={i} className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 transition ${s.done ? "border-line bg-surface/30" : isNext ? "border-fuchsia/40 bg-fuchsia/5" : "border-line bg-surface/30"}`}>
              <div className="flex min-w-0 items-start gap-3">
                {s.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted" />}
                <div className="min-w-0">
                  <div className={`font-medium ${s.done ? "text-muted line-through" : ""}`}>
                    {s.label}{s.optional && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-normal text-muted">opcional</span>}
                  </div>
                  {!s.done && <div className="mt-0.5 text-xs text-muted">{s.hint}</div>}
                </div>
              </div>
              {!s.done && (
                <Link href={s.href} className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${isNext ? "brand-gradient text-ink" : "border border-line text-fg hover:border-white/20"}`}>
                  {s.cta} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
