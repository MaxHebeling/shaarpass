"use client";

import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";

export function FinalCTA() {
  return (
    <section id="crear" className="relative px-6 py-28">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="aurora relative mx-auto max-w-4xl overflow-hidden rounded-[2.5rem] border border-white/10 px-8 py-16 text-center md:py-20"
      >
        <div className="relative z-10">
          <h2 className="font-display text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            Tu próximo evento merece
            <br />
            <span className="brand-text">quedarse con más.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-muted">
            Crea tu primer evento gratis hoy. Sin tarjeta, sin compromiso, sin letra chica.
          </p>
          <a
            href="#"
            className="brand-gradient group mt-9 inline-flex items-center gap-2 rounded-full px-8 py-4 font-semibold text-ink shadow-xl shadow-fuchsia/30 transition hover:scale-[1.03]"
          >
            Crear mi evento gratis
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </a>
        </div>
      </motion.div>
    </section>
  );
}
