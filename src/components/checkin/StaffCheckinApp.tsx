"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, XCircle, AlertTriangle, Camera, Search, DoorOpen, Calendar, MapPin, UserCheck, Loader2, Download } from "lucide-react";

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }>; }

function InstallButton() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    if (standalone) return;
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (!evt) return null;
  return (
    <button onClick={async () => { await evt.prompt(); setEvt(null); }}
      className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium transition hover:border-white/20">
      <Download className="h-3.5 w-3.5" /> Instalar app
    </button>
  );
}

interface EventInfo { title: string; coverImage: string | null; startsAt: string; timezone: string; city: string | null; region: string | null; isOnline: boolean; }
interface ScanResult { result: "ok" | "already" | "invalid"; message: string; attendee?: string | null; type?: string | null; at?: string | null; gate?: string | null; }
interface Stats { registered: number; checkedIn: number; pending: number; total: number; }
interface SearchHit { qrToken: string; name: string; type: string; status: string; }

export function StaffCheckinApp({ token, staffName, gate, event }: { token: string; staffName: string; gate: string | null; event: EventInfo }) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [log, setLog] = useState<{ name: string; ok: boolean; t: string }[]>([]);
  const [tab, setTab] = useState<"scan" | "search">("scan");
  const [cameraError, setCameraError] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const lastRef = useRef<{ token: string; at: number }>({ token: "", at: 0 });
  const busyRef = useRef(false);

  const fmtWhen = (() => { try { return new Date(event.startsAt).toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: event.timezone || "America/Mexico_City" }); } catch { return ""; } })();
  const location = event.isOnline ? "Evento virtual" : [event.city, event.region].filter(Boolean).join(", ") || "Ubicación por confirmar";

  const loadStats = useCallback(async () => {
    try { const r = await fetch(`/api/checkin/stats?token=${encodeURIComponent(token)}`); if (r.ok) setStats(await r.json()); } catch { /* offline-tolerant */ }
  }, [token]);

  // Polling de estadísticas (sincroniza varios dispositivos cada ~4s).
  useEffect(() => { loadStats(); const id = setInterval(loadStats, 4000); return () => clearInterval(id); }, [loadStats]);

  // Recuerda este escáner para que la PWA instalada reabra aquí.
  useEffect(() => { try { localStorage.setItem("shaarpass:checkin-token", token); } catch { /* noop */ } }, [token]);

  const submit = useCallback(async (qrToken: string, manual = false) => {
    if (busyRef.current) return;
    const now = Date.now();
    if (!manual && qrToken === lastRef.current.token && now - lastRef.current.at < 3000) return;
    lastRef.current = { token: qrToken, at: now };
    busyRef.current = true;
    try {
      const res = await fetch("/api/checkin/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffToken: token, token: qrToken, manual }) });
      const data: ScanResult = await res.json();
      setResult(data);
      if (data.result === "ok") { setStats((s) => s ? { ...s, checkedIn: s.checkedIn + 1, pending: Math.max(0, s.pending - 1) } : s); loadStats(); }
      setLog((l) => [{ name: data.attendee || data.type || "Boleto", ok: data.result === "ok", t: new Date().toLocaleTimeString("es-MX") }, ...l].slice(0, 10));
      if (navigator.vibrate) navigator.vibrate(data.result === "ok" ? 80 : [40, 40, 40]);
      setTimeout(() => setResult(null), 2600);
    } catch {
      setResult({ result: "invalid", message: "Sin conexión — reintenta" });
      setTimeout(() => setResult(null), 2000);
    } finally {
      setTimeout(() => { busyRef.current = false; }, 500);
    }
  }, [token, loadStats]);

  // Escáner QR (html5-qrcode), solo en pestaña de escaneo.
  useEffect(() => {
    if (tab !== "scan") return;
    let scanner: { stop: () => Promise<void> } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const s = new Html5Qrcode("staff-reader");
        scanner = s;
        await s.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, (decoded: string) => submit(decoded), () => {});
        if (cancelled) await s.stop();
      } catch { setCameraError(true); }
    })();
    return () => { cancelled = true; scanner?.stop().catch(() => {}); };
  }, [tab, submit]);

  // Búsqueda manual (debounce).
  useEffect(() => {
    if (tab !== "search" || q.trim().length < 2) { setHits([]); return; }
    const id = setTimeout(async () => {
      setSearching(true);
      try { const r = await fetch(`/api/checkin/search?token=${encodeURIComponent(token)}&q=${encodeURIComponent(q)}`); const d = await r.json(); setHits(d.results ?? []); } catch { setHits([]); }
      setSearching(false);
    }, 350);
    return () => clearTimeout(id);
  }, [q, tab, token]);

  const palette = {
    ok: { bg: "bg-emerald-500", Icon: CheckCircle2 },
    already: { bg: "bg-amber-500", Icon: AlertTriangle },
    invalid: { bg: "bg-rose-600", Icon: XCircle },
  } as const;

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-5">
      {/* Encabezado del evento */}
      <header className="glass overflow-hidden rounded-3xl">
        {event.coverImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.coverImage} alt={event.title} className="aspect-[16/7] w-full object-cover" />
        )}
        <div className="p-4">
          <h1 className="font-display text-lg font-bold leading-tight">{event.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> <span className="capitalize">{fmtWhen}</span></span>
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {location}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 rounded-full bg-fuchsia/10 px-2.5 py-1 font-medium text-fuchsia"><DoorOpen className="h-3.5 w-3.5" /> {gate || "Acceso general"}</span>
              <span className="text-muted">· {staffName}</span>
            </div>
            <InstallButton />
          </div>
        </div>
      </header>

      {/* Estadísticas en vivo */}
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <StatCard label="Registrados" value={stats?.registered} tone="muted" />
        <StatCard label="Ingresados" value={stats?.checkedIn} tone="ok" />
        <StatCard label="Pendientes" value={stats?.pending} tone="gold" />
      </div>

      {/* Pestañas */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={() => setTab("scan")} className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition ${tab === "scan" ? "brand-gradient text-ink" : "glass text-muted"}`}><Camera className="h-4 w-4" /> Escanear QR</button>
        <button onClick={() => setTab("search")} className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition ${tab === "search" ? "brand-gradient text-ink" : "glass text-muted"}`}><Search className="h-4 w-4" /> Buscar</button>
      </div>

      {tab === "scan" ? (
        <div className="mt-4">
          <div id="staff-reader" className="aspect-square w-full overflow-hidden rounded-3xl bg-black" />
          {cameraError && <p className="mt-3 text-center text-sm text-amber-400">No se pudo abrir la cámara. Da permiso de cámara o usa la búsqueda manual.</p>}
          <p className="mt-3 text-center text-xs text-muted">Apunta al QR del asistente. El registro es instantáneo.</p>
        </div>
      ) : (
        <div className="mt-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, correo, teléfono o # de boleto"
            className="w-full rounded-2xl border border-line bg-surface/60 px-4 py-3.5 text-sm outline-none focus:border-fuchsia/60" />
          <div className="mt-3 space-y-2">
            {searching && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted" /></div>}
            {!searching && q.trim().length >= 2 && hits.length === 0 && <p className="py-4 text-center text-sm text-muted">Sin resultados.</p>}
            {hits.map((h) => (
              <div key={h.qrToken} className="glass flex items-center justify-between gap-3 rounded-2xl p-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{h.name}</div>
                  <div className="text-xs text-muted">{h.type} · {h.status === "checked_in" ? "Ya ingresó" : h.status === "valid" ? "Válido" : h.status}</div>
                </div>
                {h.status === "valid" ? (
                  <button onClick={() => submit(h.qrToken, true)} className="brand-gradient shrink-0 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-ink">Registrar</button>
                ) : (
                  <span className="shrink-0 rounded-xl bg-amber-500/15 px-3 py-2 text-xs text-amber-400">Ingresado</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Últimos accesos */}
      {log.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-medium text-muted">Últimos accesos</h3>
          <div className="space-y-1.5">
            {log.map((l, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-line bg-surface/40 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 truncate">{l.ok ? <UserCheck className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-rose-400" />} <span className="truncate">{l.name}</span></span>
                <span className="shrink-0 text-xs text-muted">{l.t}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overlay de resultado a pantalla completa */}
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`fixed inset-0 z-50 flex flex-col items-center justify-center px-8 text-center text-white ${palette[result.result].bg}`}>
            {(() => { const Icon = palette[result.result].Icon; return <Icon className="h-24 w-24" strokeWidth={2.2} />; })()}
            <div className="mt-5 font-display text-3xl font-bold">{result.message}</div>
            {result.attendee && <div className="mt-2 text-xl font-medium">{result.attendee}</div>}
            {result.type && <div className="mt-1 text-base text-white/85">{result.type}</div>}
            {result.at && <div className="mt-3 text-sm text-white/80">{result.result === "already" ? "Ingreso previo: " : "Hora: "}{new Date(result.at).toLocaleTimeString("es-MX")}{result.gate ? ` · ${result.gate}` : ""}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function StatCard({ label, value, tone }: { label: string; value?: number; tone: "muted" | "ok" | "gold" }) {
  const color = tone === "ok" ? "text-emerald-400" : tone === "gold" ? "text-gold" : "text-fg";
  return (
    <div className="glass rounded-2xl p-3 text-center">
      <div className={`font-display text-2xl font-bold tabular-nums ${color}`}>{value != null ? value.toLocaleString("es-MX") : "—"}</div>
      <div className="mt-0.5 text-[11px] text-muted">{label}</div>
    </div>
  );
}
