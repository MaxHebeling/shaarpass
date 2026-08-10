"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Wallet, Info } from "lucide-react";
import {
  ourFeeCents,
  marginCents,
  eventbriteMxFeeCents,
  processingRate,
  fmt,
  OUR_PERCENT,
  OUR_FIXED_CENTS,
  EVENTBRITE_MX_SERVICE_PCT,
  EVENTBRITE_MX_PROCESSING_PCT,
} from "@/lib/ticketing/feeMath";

/**
 * Calculadora de comisiones en pesos.
 *
 * Regla de la casa: aquí no se maquilla nada. Mostramos el desglose real de lo
 * que paga el comprador (nuestro margen + el procesamiento de la pasarela, que
 * trasladamos tal cual) y lo comparamos con la tarifa PUBLICADA de Eventbrite
 * México — salga a favor o en contra. Donde ganamos siempre es en lo que recibe
 * el organizador: el 100% del precio del boleto, el mismo día.
 */
export function FeeComparator() {
  const [price, setPrice] = useState(250); // pesos
  const [qty, setQty] = useState(200);

  const m = useMemo(() => {
    const subtotal = Math.round(price * 100) * qty;
    const ours = ourFeeCents(subtotal, qty, "mxn");
    const margin = marginCents(subtotal, qty);
    const eb = eventbriteMxFeeCents(subtotal);
    return {
      subtotal,
      ours,
      margin,
      processing: Math.max(0, ours - margin),
      eb,
      buyerOurs: subtotal + ours,
      buyerEb: subtotal + eb,
      diff: eb - ours, // > 0 ⇒ con nosotros el comprador paga menos
    };
  }, [price, qty]);

  const proc = processingRate("mxn");
  const cheaper = m.diff > 0;

  return (
    <section id="comisiones" className="relative px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
            Las cuentas, <span className="brand-text">completas</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted">
            Mueve los controles y mira el desglose real, en pesos. Sin cargos que aparecen al final.
          </p>
        </div>

        <div className="glass grid gap-8 rounded-[2rem] p-7 md:grid-cols-2 md:p-10">
          {/* Controles */}
          <div className="flex flex-col justify-center gap-8">
            <Control label="Precio por boleto" value={fmt(price * 100)} min={50} max={3000} step={10} raw={price} onChange={setPrice} />
            <Control label="Boletos vendidos" value={qty.toLocaleString("es-MX")} min={10} max={5000} step={10} raw={qty} onChange={setQty} />

            <div className="glass rounded-2xl p-4 text-sm leading-relaxed text-muted">
              Nuestro margen: <span className="font-semibold text-fg">{OUR_PERCENT}% + {fmt(OUR_FIXED_CENTS)}</span> por boleto.
              El procesamiento de pago (<span className="text-fg">{proc.pct}% + {fmt(proc.fixed)}</span> en México)
              lo cobra la pasarela y lo trasladamos <span className="text-fg">sin aumentarlo</span>.
            </div>
          </div>

          {/* Resultado */}
          <div className="flex flex-col gap-4">
            <motion.div
              key={m.subtotal}
              initial={{ scale: 0.96, opacity: 0.6 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="brand-gradient relative overflow-hidden rounded-3xl p-6 text-ink"
            >
              <div className="flex items-center gap-2 text-sm font-semibold opacity-80">
                <Wallet className="h-4 w-4" /> Tú recibes
              </div>
              <div className="mt-1 font-display text-5xl font-bold tracking-tight">{fmt(m.subtotal)}</div>
              <div className="mt-1 text-sm font-medium opacity-80">
                El 100% del precio de tus boletos · en tu cuenta el mismo día
              </div>
            </motion.div>

            {/* Desglose de lo que paga el comprador */}
            <div className="rounded-2xl border border-line bg-surface/40 p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Tu comprador paga</div>
              <Row label="Boletos" value={fmt(m.subtotal)} />
              <Row label={`Nuestro margen (${OUR_PERCENT}% + ${fmt(OUR_FIXED_CENTS)}/boleto)`} value={fmt(m.margin)} />
              <Row label="Procesamiento de pago (pasarela)" value={fmt(m.processing)} />
              <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3">
                <span className="text-sm font-semibold text-fg">Total</span>
                <span className="font-display text-2xl font-bold text-gold">{fmt(m.buyerOurs)}</span>
              </div>
            </div>

            {/* Comparación honesta */}
            <div className="rounded-2xl border border-line bg-surface/40 p-4 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-muted">Lo mismo en Eventbrite México</span>
                <span className="font-semibold text-fg">{fmt(m.buyerEb)}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                {cheaper ? (
                  <>
                    A este precio tu comprador paga <span className="font-semibold text-emerald-400">{fmt(m.diff)} menos</span> con nosotros.
                  </>
                ) : (
                  <>
                    A este precio tu comprador paga <span className="font-semibold text-fg">{fmt(-m.diff)} más</span> con nosotros:
                    su {EVENTBRITE_MX_PROCESSING_PCT}% de procesamiento es interno y no cubre el costo real de la pasarela.
                    La diferencia se empareja en boletos de mayor precio — y a cambio recibes tu dinero el mismo día,
                    con el desglose a la vista y la reventa topada al precio original.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        <p className="mx-auto mt-6 flex max-w-3xl items-start gap-2 text-center text-xs leading-relaxed text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Eventbrite México: tarifa de servicio {EVENTBRITE_MX_SERVICE_PCT}% + procesamiento {EVENTBRITE_MX_PROCESSING_PCT}%,
            según sus tarifas publicadas para organizadores en México. Nuestro cálculo incluye el costo real de la pasarela,
            que trasladamos sin margen. Las tarifas de cada plataforma pueden cambiar; verifica siempre en la fuente.
          </span>
        </p>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-fg">{value}</span>
    </div>
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
        aria-label={label}
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
