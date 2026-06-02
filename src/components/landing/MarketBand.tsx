"use client";

import { motion } from "motion/react";

const stats = [
  { big: "2% + $0.50", small: "por boleto. Punto." },
  { big: "Mismo día", small: "para recibir tu dinero" },
  { big: "0%", small: "de retención sobre tus ventas" },
  { big: "100%", small: "soporte por humanos reales" },
];

export function MarketBand() {
  return (
    <section className="relative border-y border-line bg-ink-2/60 px-6 py-14">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 md:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.small}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.5 }}
            className="text-center"
          >
            <div className="brand-text font-display text-3xl font-bold tracking-tight md:text-4xl">
              {s.big}
            </div>
            <div className="mt-1 text-sm text-muted">{s.small}</div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
