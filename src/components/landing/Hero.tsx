"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { ArrowRight, Sparkles, Zap, ShieldCheck } from "lucide-react";

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
    <section className="relative overflow-hidden px-6 pb-24 pt-40 md:pt-48">
      {/* Imagen de fondo full-bleed */}
      <Image src="/hero.jpg" alt="" fill priority sizes="100vw" className="object-cover object-center" />
      <div className="absolute inset-0 bg-gradient-to-b from-ink/60 via-ink/80 to-ink" />
      <div className="absolute inset-0 bg-ink/30" />

      <div className="relative z-10 mx-auto max-w-4xl text-center">
        <motion.div
          variants={fadeUp}
          custom={0}
          initial="hidden"
          animate="show"
          className="glass mx-auto mb-7 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs text-muted"
        >
          <Sparkles className="h-3.5 w-3.5 text-gold" />
          La alternativa premium a Eventbrite
        </motion.div>

        <motion.h1
          variants={fadeUp}
          custom={1}
          initial="hidden"
          animate="show"
          className="font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl"
        >
          Te quedas con <span className="brand-text">más dinero</span>
          <br />
          de cada boleto.
        </motion.h1>

        <motion.p
          variants={fadeUp}
          custom={2}
          initial="hidden"
          animate="show"
          className="mx-auto mt-6 max-w-xl text-lg text-muted md:text-xl"
        >
          Vende entradas para tus eventos con la comisión más baja y transparente
          del mercado. Sin letra chica. Sin sorpresas. Tu dinero, cuando lo necesitas.
        </motion.p>

        <motion.div
          variants={fadeUp}
          custom={3}
          initial="hidden"
          animate="show"
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <a
            href="#crear"
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
          variants={fadeUp}
          custom={4}
          initial="hidden"
          animate="show"
          className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-sm text-muted"
        >
          <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-gold" /> Pagos al instante</span>
          <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-gold" /> Anti-reventa de boletos</span>
          <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-gold" /> Soporte humano real</span>
        </motion.div>
      </div>
    </section>
  );
}
