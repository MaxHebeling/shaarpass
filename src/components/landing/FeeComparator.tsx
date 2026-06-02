"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { TrendingUp } from "lucide-react";
import { ourFeeCents, eventbriteFeeCents, fmt, OUR_PERCENT, OUR_FIXED_CENTS } from "@/lib/ticketing/feeMath";

export function FeeComparator() {
  const [price, setPrice] = useState(25); // dólares
  const [qty, setQty] = useState(200);

  const { ours, eb, savings, netOurs, netEb, pct } = useMemo(() => {
    const subtotal = Math.round(price * 100) * qty;
    const ours = ourFeeCents(Math.round(price * 100) * qty, qty);
    const eb = eventbriteFeeCents(Math.round(price * 100) * qty, qty);
    const savings = eb - ours;
    return {
      ours,
      eb,
      savings,
      netOurs: subtotal - ours,
      netEb: subtotal - eb,
      pct: eb > 0 ? Math.round((savings / eb) * 100) : 0,
    };
  }, [price, qty]);

  return (
    <section id="comisiones" className="relative px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
            Mira cuánto <span className="brand-text">te quedas tú</span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted">
            Mueve los controles. La diferencia va directo a tu bolsillo, evento tras evento.
          </p>
        </div>

        <div className="glass grid gap-8 rounded-[2rem] p-7 md:grid-cols-2 md:p-10">
          {/* Controles */}
          <div className="flex flex-col justify-center gap-8">
            <Control
              label="Precio por boleto"
              value={fmt(price * 100)}
              min={5}
              max={250}
              step={1}
              raw={price}
              onChange={setPrice}
            />
            <Control
              label="Boletos vendidos"
              value={qty.toLocaleString("en-US")}
              min={10}
              max={5000}
              step={10}
              raw={qty}
              onChange={setQty}
            />

            <div className="glass rounded-2xl p-4 text-sm text-muted">
              Nuestra comisión: <span className="font-semibold text-fg">{OUR_PERCENT}% + {fmt(OUR_FIXED_CENTS)}</span> por boleto + procesamiento de pago.
              Eventbrite: <span className="text-fg">3.7% + $1.79 + 2.9%</span>.
            </div>
          </div>

          {/* Resultado */}
          <div className="flex flex-col gap-4">
            <motion.div
              key={savings}
              initial={{ scale: 0.96, opacity: 0.6 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="brand-gradient relative overflow-hidden rounded-3xl p-6 text-ink"
            >
              <div className="flex items-center gap-2 text-sm font-semibold opacity-80">
                <TrendingUp className="h-4 w-4" /> Ahorras con ShaarPass
              </div>
              <div className="mt-1 font-display text-5xl font-bold tracking-tight">
                {fmt(savings)}
              </div>
              <div className="mt-1 text-sm font-medium opacity-80">
                {pct}% menos en comisiones · en este solo evento
              </div>
            </motion.div>

            <div className="grid grid-cols-2 gap-4">
              <Stat label="Recibes con nosotros" value={fmt(netOurs)} good />
              <Stat label="Recibirías con Eventbrite" value={fmt(netEb)} />
            </div>
            <p className="text-center text-xs text-muted">
              Comisión nuestra: <span className="text-fg">{fmt(ours)}</span> · Eventbrite: <span className="text-fg">{fmt(eb)}</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Control({
  label, value, min, max, step, raw, onChange,
}: {
  label: string; value: string; min: number; max: number; step: number; raw: number; onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm text-muted">{label}</span>
        <span className="font-display text-2xl font-bold text-fg">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={raw}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-fuchsia
          [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gold
          [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-gold/40"
      />
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${good ? "border-gold/40 bg-gold/5" : "border-line bg-surface/40"}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 font-display text-xl font-bold ${good ? "text-gold" : "text-muted line-through decoration-fuchsia/60"}`}>
        {value}
      </div>
    </div>
  );
}
