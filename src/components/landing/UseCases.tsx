"use client";

import { Music, Mic2, Church, Trophy, Theater, PartyPopper, GraduationCap, Utensils } from "lucide-react";

const cats = [
  { icon: Music, label: "Conciertos" },
  { icon: Mic2, label: "Conferencias" },
  { icon: Church, label: "Eventos de iglesia" },
  { icon: Trophy, label: "Deportes" },
  { icon: Theater, label: "Teatro" },
  { icon: PartyPopper, label: "Festivales" },
  { icon: GraduationCap, label: "Talleres" },
  { icon: Utensils, label: "Cenas & galas" },
];

export function UseCases() {
  const loop = [...cats, ...cats]; // duplicado para marquee continuo
  return (
    <section className="relative py-14">
      <p className="mb-8 text-center text-sm uppercase tracking-[0.2em] text-muted">
        Hecho para todo tipo de evento
      </p>
      <div className="marquee-mask overflow-hidden">
        <div className="marquee-track gap-4">
          {loop.map((c, i) => (
            <div
              key={i}
              className="glass flex shrink-0 items-center gap-2.5 rounded-2xl px-5 py-3 text-sm font-medium text-fg/90"
            >
              <c.icon className="h-4 w-4 text-gold" strokeWidth={2.2} />
              {c.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
