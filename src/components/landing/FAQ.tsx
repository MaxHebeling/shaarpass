"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus } from "lucide-react";

const faqs = [
  {
    q: "¿Cuánto cobra ShaarPass?",
    a: "Nuestra comisión es 2% + $0.50 por boleto, más el costo de procesamiento de pago (la tarifa de tu pasarela). Lo ves todo desglosado antes de publicar y el comprador lo ve antes de pagar. Cero cargos ocultos. Los eventos gratuitos no pagan comisión.",
  },
  {
    q: "¿Cuándo recibo mi dinero?",
    a: "El dinero de tus ventas llega a tu propia cuenta de Stripe el mismo día, no semanas después del evento. No retenemos un porcentaje de tus ventas.",
  },
  {
    q: "¿Necesito conocimientos técnicos?",
    a: "No. Creas tu cuenta, conectas tu cuenta de cobro una sola vez y publicas tu evento en minutos. Si quieres, te ayudamos a montar tu primer evento.",
  },
  {
    q: "¿Cómo evitan la reventa y los boletos falsos?",
    a: "Cada boleto tiene un QR seguro que rota cada 15 segundos, imposible de clonar o capturar. La reventa entre fans está topada al precio original: nada de scalping.",
  },
  {
    q: "¿Sirve para eventos grandes con mucha demanda?",
    a: "Sí. Tenemos cola virtual para onsales masivos, límites de compra por persona, anti-bot y mapas de recinto para estadios de 50,000+ asientos.",
  },
  {
    q: "¿Y si tengo un problema el día del evento?",
    a: "Hablas con una persona real, no con un bot. El check-in funciona desde el teléfono e incluso sin internet, sincronizando al reconectar.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="relative px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12 text-center">
          <p className="mb-3 text-sm uppercase tracking-[0.2em] text-muted">Preguntas frecuentes</p>
          <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
            Lo que todos <span className="brand-text">preguntan</span>
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={i} className="glass overflow-hidden rounded-2xl">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="font-medium">{f.q}</span>
                  <Plus
                    className={`h-5 w-5 shrink-0 text-gold transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <p className="px-5 pb-5 text-sm leading-relaxed text-muted">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
