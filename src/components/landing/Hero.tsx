"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { ArrowRight, Sparkles, Zap, ShieldCheck, QrCode, CheckCircle2 } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-24 pt-36 md:pb-28 md:pt-44">
      {/* Imagen de fondo full-bleed */}
      <Image src="/hero.jpg" alt="" fill priority sizes="100vw" className="object-cover object-center" />
      <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/85 to-ink" />
      <div className="absolute inset-0 bg-ink/40" />

      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        {/* Columna de copy */}
        <div className="text-center lg:text-left">
          <motion.div
            variants={fadeUp} custom={0} initial="hidden" animate="show"
            className="ring-grad glass mx-auto mb-7 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs text-muted lg:mx-0"
          >
            <Sparkles className="h-3.5 w-3.5 text-gold" />
            La alternativa premium a Eventbrite
          </motion.div>

          <motion.h1
            variants={fadeUp} custom={1} initial="hidden" animate="show"
            className="font-display text-5xl font-bold leading-[1.04] tracking-tight md:text-6xl xl:text-7xl"
          >
            Te quedas con <span className="brand-text text-glow">más dinero</span>
            <br className="hidden sm:block" /> de cada boleto.
          </motion.h1>

          <motion.p
            variants={fadeUp} custom={2} initial="hidden" animate="show"
            className="mx-auto mt-6 max-w-xl text-lg text-muted md:text-xl lg:mx-0"
          >
            Vende entradas con la comisión más baja y transparente del mercado.
            Sin letra chica, sin sorpresas. Tu dinero, cuando lo necesitas.
          </motion.p>

          <motion.div
            variants={fadeUp} custom={3} initial="hidden" animate="show"
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start"
          >
            <a
              href="/login"
              className="brand-gradient group flex items-center gap-2 rounded-full px-7 py-3.5 font-semibold text-ink shadow-xl shadow-fuchsia/30 transition hover:scale-[1.03]"
            >
              Crea tu evento gratis
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </a>
            <a
              href="#comisiones"
              className="glass rounded-full px-7 py-3.5 font-semibold text-fg transition hover:border-white/20"
            >
              Calcula cuánto ahorras
            </a>
          </motion.div>

          <motion.div
            variants={fadeUp} custom={4} initial="hidden" animate="show"
            className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-sm text-muted lg:justify-start"
          >
            <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-gold" /> Pagos al instante</span>
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-gold" /> Anti-reventa de boletos</span>
            <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-gold" /> Soporte humano real</span>
          </motion.div>
        </div>

        {/* Columna del mockup de boleto */}
        <motion.div
          initial={{ opacity: 0, y: 40, rotate: -3 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ delay: 0.35, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto hidden w-full max-w-sm lg:block"
        >
          <TicketMock />
        </motion.div>
      </div>
    </section>
  );
}

/** Boleto de producto (CSS puro) — da credibilidad visual sin assets. */
function TicketMock() {
  return (
    <div className="halo animate-float-slow">
      <div className="ring-grad glass rounded-[2rem] p-6 shadow-2xl shadow-black/50">
        {/* Cabecera */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="brand-gradient grid h-7 w-7 place-items-center rounded-lg text-ink">
              <QrCode className="h-4 w-4" strokeWidth={2.5} />
            </span>
            ShaarPass
          </div>
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> Pagado
          </span>
        </div>

        {/* Evento */}
        <div className="mt-5">
          <div className="text-xs uppercase tracking-wider text-muted">Concierto · Tijuana</div>
          <div className="mt-1 font-display text-2xl font-bold leading-tight">Noche de Adoración 2026</div>
          <div className="mt-1 text-sm text-muted">Sáb 12 sep · 8:00 PM · Zona VIP</div>
        </div>

        {/* Perforación */}
        <div className="relative my-5">
          <div className="hairline" />
          <span className="absolute -left-9 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-ink" />
          <span className="absolute -right-9 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-ink" />
        </div>

        {/* QR + precio */}
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-5 gap-1">
            {QR_PATTERN.map((on, i) => (
              <span key={i} className={`h-3 w-3 rounded-[3px] ${on ? "bg-fg" : "bg-white/10"}`} />
            ))}
          </div>
          <div className="text-right">
            <div className="text-xs text-muted">Total</div>
            <div className="font-display text-2xl font-bold text-gold">$1,200</div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-1.5 text-[11px] text-muted">
          <ShieldCheck className="h-3.5 w-3.5 text-gold" /> QR seguro · rota cada 15s · imposible de clonar
        </div>
      </div>
    </div>
  );
}

// Patrón decorativo tipo QR (5x5), determinista.
const QR_PATTERN = [
  1, 1, 0, 1, 1,
  1, 0, 1, 0, 1,
  0, 1, 1, 1, 0,
  1, 0, 1, 0, 1,
  1, 1, 0, 1, 1,
];
