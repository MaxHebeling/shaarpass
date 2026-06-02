"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, XCircle, AlertTriangle, ScanLine, Keyboard, Camera } from "lucide-react";

interface ScanResult {
  result: "ok" | "already" | "invalid";
  message: string;
  event?: string;
  type?: string;
  attendee?: string;
}

export default function CheckinPage() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [count, setCount] = useState(0);
  const [log, setLog] = useState<{ name: string; ok: boolean; t: string }[]>([]);
  const [manual, setManual] = useState("");
  const [cameraError, setCameraError] = useState(false);
  const lastRef = useRef<{ token: string; at: number }>({ token: "", at: 0 });
  const busyRef = useRef(false);

  async function handleToken(token: string) {
    const now = Date.now();
    if (busyRef.current) return;
    if (token === lastRef.current.token && now - lastRef.current.at < 3000) return;
    lastRef.current = { token, at: now };
    busyRef.current = true;
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data: ScanResult = await res.json();
      setResult(data);
      if (data.result === "ok") setCount((c) => c + 1);
      setLog((l) => [{ name: data.attendee || data.type || token.slice(0, 10), ok: data.result === "ok", t: new Date().toLocaleTimeString("es-MX") }, ...l].slice(0, 8));
      if (navigator.vibrate) navigator.vibrate(data.result === "ok" ? 80 : [40, 40, 40]);
      setTimeout(() => setResult(null), 2800);
    } finally {
      setTimeout(() => { busyRef.current = false; }, 600);
    }
  }

  useEffect(() => {
    let scanner: { stop: () => Promise<void> } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const s = new Html5Qrcode("reader");
        scanner = s;
        await s.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded: string) => handleToken(decoded),
          () => {}
        );
        if (cancelled) await s.stop();
      } catch {
        setCameraError(true);
      }
    })();
    return () => {
      cancelled = true;
      scanner?.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const palette = {
    ok: { bg: "bg-emerald-500", icon: CheckCircle2 },
    already: { bg: "bg-gold", icon: AlertTriangle },
    invalid: { bg: "bg-fuchsia", icon: XCircle },
  } as const;

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Check-in</h1>
          <p className="text-sm text-muted">Escanea el QR en la entrada</p>
        </div>
        <div className="glass rounded-2xl px-4 py-2 text-center">
          <div className="font-display text-2xl font-bold text-gold">{count}</div>
          <div className="text-[11px] text-muted">ingresos</div>
        </div>
      </div>

      {/* Cámara */}
      <div className="relative overflow-hidden rounded-3xl border border-line bg-black">
        <div id="reader" className="aspect-square w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
        {!cameraError && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-56 w-56 rounded-2xl border-2 border-white/40" />
            <ScanLine className="absolute h-7 w-7 animate-pulse text-white/70" />
          </div>
        )}
        {cameraError && (
          <div className="grid aspect-square w-full place-items-center p-6 text-center text-muted">
            <div>
              <Camera className="mx-auto mb-2 h-8 w-8" />
              Cámara no disponible. Usa el código manual abajo.
            </div>
          </div>
        )}
      </div>

      {/* Resultado */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`mt-4 flex items-center gap-4 rounded-3xl p-5 text-ink ${palette[result.result].bg}`}
          >
            {(() => { const I = palette[result.result].icon; return <I className="h-10 w-10 shrink-0" strokeWidth={2.4} />; })()}
            <div>
              <div className="font-display text-2xl font-bold">{result.message}</div>
              {(result.attendee || result.type) && (
                <div className="text-sm font-medium opacity-80">
                  {result.attendee}{result.attendee && result.type ? " · " : ""}{result.type}
                </div>
              )}
              {result.event && <div className="text-xs opacity-70">{result.event}</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Entrada manual */}
      <form
        onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { handleToken(manual.trim()); setManual(""); } }}
        className="mt-4 flex gap-2"
      >
        <div className="flex flex-1 items-center gap-2 rounded-2xl border border-line bg-surface/60 px-4">
          <Keyboard className="h-4 w-4 text-muted" />
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Código manual"
            className="w-full bg-transparent py-3 text-sm outline-none"
          />
        </div>
        <button className="glass rounded-2xl px-5 font-semibold transition hover:border-white/20">Validar</button>
      </form>

      {/* Historial */}
      {log.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted">Recientes</div>
          <div className="space-y-1.5">
            {log.map((e, i) => (
              <div key={i} className="glass flex items-center justify-between rounded-xl px-4 py-2 text-sm">
                <span className="flex items-center gap-2">
                  {e.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-fuchsia" />}
                  {e.name}
                </span>
                <span className="text-xs text-muted">{e.t}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
