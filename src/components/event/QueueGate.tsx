"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Loader2, Users, Clock, CheckCircle2 } from "lucide-react";

type Phase = "joining" | "waiting" | "admitted" | "error";

declare global { interface Window { turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => void } } }

export function QueueGate({
  eventId, enabled, onsaleAt, children,
}: { eventId: string; enabled: boolean; onsaleAt: string | null; children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("joining");
  const [pos, setPos] = useState<number | null>(null);
  const [ahead, setAhead] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const turnstileBox = useRef<HTMLDivElement>(null);

  async function join(turnstileToken?: string) {
    try {
      const res = await fetch("/api/queue/join", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, turnstileToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo unir a la cola");
      tokenRef.current = data.token;
      setPhase(data.status === "admitted" ? "admitted" : "waiting");
      setPos(data.pos);
      if (data.status === "admitted") sessionStorage.setItem(`queue:${eventId}`, data.token);
    } catch (e) { setError((e as Error).message); setPhase("error"); }
  }

  useEffect(() => {
    if (!enabled) return;
    const hasKey = siteKey && !siteKey.includes("REEMPLAZA");
    if (!hasKey) { join(); return; }
    // Carga Turnstile y une al obtener token.
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.onload = () => {
      if (window.turnstile && turnstileBox.current) {
        window.turnstile.render(turnstileBox.current, { sitekey: siteKey, callback: (t: string) => join(t) });
      } else join();
    };
    document.head.appendChild(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Polling de estado
  useEffect(() => {
    if (phase !== "waiting") return;
    const id = setInterval(async () => {
      if (!tokenRef.current) return;
      const res = await fetch(`/api/queue/status?eventId=${eventId}&token=${tokenRef.current}`);
      const data = await res.json();
      setPos(data.pos); setAhead(data.ahead);
      if (data.status === "admitted") {
        sessionStorage.setItem(`queue:${eventId}`, tokenRef.current!);
        setPhase("admitted");
      }
    }, 4000);
    return () => clearInterval(id);
  }, [phase, eventId]);

  if (!enabled) return <>{children}</>;
  if (phase === "admitted") {
    return (
      <div>
        <div className="mb-3 flex items-center gap-2 rounded-2xl bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> ¡Es tu turno! Tienes unos minutos para completar tu compra.
        </div>
        {children}
      </div>
    );
  }

  const future = onsaleAt && new Date(onsaleAt) > new Date();
  return (
    <div className="glass rounded-3xl p-7 text-center">
      <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 2 }}
        className="brand-gradient mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl text-ink">
        <Users className="h-7 w-7" />
      </motion.div>
      {phase === "joining" && <p className="text-muted"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Entrando a la sala de espera…</p>}
      {phase === "error" && <p className="text-sm text-fuchsia">{error}</p>}
      {phase === "waiting" && (
        <>
          <h3 className="font-display text-xl font-bold">{future ? "Estás en la sala de espera" : "Estás en la fila"}</h3>
          <p className="mt-1 text-sm text-muted">
            {future
              ? "Cuando abra la venta se asignará tu lugar de forma aleatoria. No cierres esta página."
              : "Te admitiremos por orden. Mantén esta página abierta."}
          </p>
          {pos != null && (
            <div className="mt-4 flex items-center justify-center gap-2 font-display text-3xl font-bold text-gold">
              <Clock className="h-6 w-6" /> {ahead != null ? `${ahead} adelante de ti` : `Posición ${pos}`}
            </div>
          )}
          {pos == null && !future && <p className="mt-3 text-sm text-muted">Asignando tu lugar…</p>}
        </>
      )}
      <div ref={turnstileBox} className="mt-4 flex justify-center" />
    </div>
  );
}
