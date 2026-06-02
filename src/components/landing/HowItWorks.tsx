"use client";

import { motion } from "motion/react";

const steps = [
  { n: "01", title: "Crea tu evento", body: "Sube tu evento, define tipos de boleto y precios en minutos. Publicar es gratis." },
  { n: "02", title: "Comparte y vende", body: "Tu página de evento lista para vender. Comparte el link y empieza a cobrar." },
  { n: "03", title: "Cobra al instante", body: "El dinero llega a tu cuenta el mismo día. Tú te quedas con casi todo." },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="relative px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-14 text-center">
          <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
            Vendiendo en <span className="brand-text">tres pasos</span>
          </h2>
        </div>

        <div className="relative grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.12, duration: 0.5 }}
              className="glass relative rounded-3xl p-7"
            >
              <div className="brand-text font-display text-5xl font-bold">{s.n}</div>
              <h3 className="mt-3 font-display text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
