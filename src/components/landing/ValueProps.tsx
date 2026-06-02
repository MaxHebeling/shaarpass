"use client";

import { motion } from "motion/react";
import { Wallet, Zap, ShieldCheck, QrCode, BarChart3, HeartHandshake } from "lucide-react";

const items = [
  { icon: Wallet, title: "Fees bajos y transparentes", body: "2% + $0.50 por boleto. Lo ves antes de publicar. Sin cargos ocultos al cobrar." },
  { icon: Zap, title: "Pagos al instante", body: "Tu dinero el mismo día, no semanas después del evento. Sin retenciones del 20%." },
  { icon: ShieldCheck, title: "Inventario blindado", body: "Imposible sobrevender. Cada boleto está garantizado a nivel de base de datos." },
  { icon: QrCode, title: "Check-in en segundos", body: "Escanea QR desde el teléfono, incluso sin internet. Sincroniza al reconectar." },
  { icon: BarChart3, title: "Ventas en tiempo real", body: "Dashboard con ventas, asistencia y check-ins en vivo durante tu evento." },
  { icon: HeartHandshake, title: "Soporte humano real", body: "Hablas con una persona, no con un bot. Te respondemos cuando algo importa." },
];

export function ValueProps() {
  return (
    <section id="ventajas" className="relative px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-14 text-center">
          <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
            Todo lo de Eventbrite. <span className="brand-text">Mejor.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted">
            Las herramientas que ya conoces, sin los dolores de cabeza que odias.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {items.map((it, i) => (
            <motion.div
              key={it.title}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: (i % 3) * 0.08, duration: 0.5 }}
              className="glass group rounded-3xl p-6 transition hover:border-white/20"
            >
              <div className="brand-gradient mb-4 grid h-11 w-11 place-items-center rounded-2xl text-ink shadow-lg shadow-fuchsia/20">
                <it.icon className="h-5 w-5" strokeWidth={2.4} />
              </div>
              <h3 className="font-display text-lg font-semibold">{it.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{it.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
