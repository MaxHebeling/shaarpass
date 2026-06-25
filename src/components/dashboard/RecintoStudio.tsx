"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, ImageUp, Loader2, Check, ScanSearch, Wand2, ArrowRight,
  Rocket, Plus, Gauge, Eye, Users, DoorOpen, ShieldAlert,
} from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { setMapBackground, autoGenerateLayout, saveZone, publishMap } from "@/app/dashboard/recintos/actions";
import { MapEditor, type EditorZone, type EditorSeat } from "@/components/dashboard/MapEditor";
import { VenueViewer } from "@/components/dashboard/VenueViewer";
import { VenueModel3D } from "@/components/dashboard/VenueModel3D";
import { capacityMatrix } from "@/lib/venue/capacity";

type Step = "upload" | "analyzing" | "studio";
interface Analysis { shapeNotes?: string; stageSide?: string; blockedAreas?: string[]; suggestedPerRow?: number; centralAisle?: boolean; lateralAisles?: boolean; estimatedCapacity?: number; zones?: string[]; recommendations?: string[]; }

const ANALYZE_STEPS = ["Analizando estructura", "Detectando paredes", "Detectando escenario", "Reconociendo columnas", "Detectando accesos", "Detectando salidas", "Detectando baños", "Calculando dimensiones", "Detectando obstáculos", "Calculando capacidad", "Generando distribución óptima", "Optimizando circulación"];
const EVENT_TYPES = ["Conferencia", "Congreso", "Concierto", "Iglesia", "Teatro", "Graduación", "Boda", "Cena", "Banquete", "Exposición", "Capacitación", "Arena", "Auditorio"];
const QUICK = [
  { name: "Escenario", kind: "ga", color: "#d6219b" }, { name: "Baños", kind: "ga", color: "#38bdf8" },
  { name: "Área VIP", kind: "ga", color: "#eab308" }, { name: "Mesas", kind: "table", color: "#f59e0b" },
  { name: "Camerinos", kind: "ga", color: "#64748b" }, { name: "Pantalla LED", kind: "ga", color: "#a855f7" },
  { name: "Cabina técnica", kind: "ga", color: "#22d3ee" }, { name: "Zona de prensa", kind: "ga", color: "#fb7185" },
];
const fld = "w-full rounded-lg border border-line bg-surface/60 px-2.5 py-2 text-sm outline-none focus:border-fuchsia/60";

export function RecintoStudio({ mapId, name, widthM, heightM, status, backgroundUrl, zones, seats }: {
  mapId: string; name: string; widthM: number; heightM: number; status: string; backgroundUrl: string | null; zones: EditorZone[]; seats: EditorSeat[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(zones.length > 0 ? "studio" : "upload");
  const [bgUrl, setBgUrl] = useState<string | null>(backgroundUrl);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [publishing, setPublishing] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Parámetros (panel derecho)
  const [unit, setUnit] = useState<"m" | "ft">("m");
  const [width, setWidth] = useState(String(widthM || 20));
  const [length, setLength] = useState(String(heightM || 30));
  const [height, setHeight] = useState("4");
  const [eventType, setEventType] = useState("Conferencia");
  const [chairs, setChairs] = useState("300");
  const [perRow, setPerRow] = useState("20");
  const [seatGap, setSeatGap] = useState("0.55");
  const [rowGap, setRowGap] = useState("0.9");
  const [centralAisle, setCentralAisle] = useState(true);
  const [lateralAisles, setLateralAisles] = useState(true);
  // Opción 2: crear por datos (sin foto)
  const [mode, setMode] = useState<"foto" | "datos">("foto");
  const [shape, setShape] = useState("Rectangular");
  const [columns, setColumns] = useState("0");
  const [stageSide, setStageSide] = useState("Frente");

  const area = (Number(width) || 0) * (Number(length) || 0);
  const capacity = seats.length;
  const exits = zones.filter((z) => z.name.toLowerCase().startsWith("salida")).length;
  const baths = zones.filter((z) => z.name.toLowerCase().includes("baño")).length;

  async function uploadPhoto(file: File) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setErr("Formato no válido (JPG, PNG, WEBP)"); return; }
    setUploading(true); setErr(null);
    try {
      const db = createClient();
      const path = `${mapId}/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, "_")}`;
      const { error } = await db.storage.from("venue-plans").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = db.storage.from("venue-plans").getPublicUrl(path);
      await setMapBackground(mapId, data.publicUrl);
      setBgUrl(data.publicUrl);
    } catch (e) { setErr((e as Error).message); } finally { setUploading(false); }
  }

  function runAnalyzeAndGenerate(useAI: boolean) {
    setErr(null); setStep("analyzing"); setStepIdx(0);
    timer.current = setInterval(() => setStepIdx((s) => Math.min(s + 1, ANALYZE_STEPS.length - 1)), 550);
    start(async () => {
      try {
        if (useAI && bgUrl) {
          const r = await fetch("/api/venue/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: bgUrl, widthM: Number(width), lengthM: Number(length), totalChairs: Number(chairs), unit }) });
          const d = await r.json();
          if (d.ok && d.analysis) {
            const a: Analysis = d.analysis; setAnalysis(a);
            if (a.suggestedPerRow) setPerRow(String(a.suggestedPerRow));
            if (typeof a.centralAisle === "boolean") setCentralAisle(a.centralAisle);
            if (typeof a.lateralAisles === "boolean") setLateralAisles(a.lateralAisles);
          } else if (d.reason === "no_key") {
            setErr("Sugerencia IA inactiva (falta ANTHROPIC_API_KEY); generé con tus medidas.");
          }
        }
        await doGenerate();
        if (timer.current) clearInterval(timer.current);
        setStepIdx(ANALYZE_STEPS.length - 1);
        setStep("studio");
        router.refresh();
      } catch (e) { setErr((e as Error).message); if (timer.current) clearInterval(timer.current); setStep("upload"); }
    });
  }

  async function doGenerate(extra?: Partial<{ seatGap: number; rowGap: number; perRow: number; centralAisle: boolean; lateralAisles: boolean }>) {
    await autoGenerateLayout({
      mapId, widthM: Number(width) || 20, lengthM: Number(length) || 30, unit,
      totalChairs: Math.max(1, Number(chairs) || 0), perRow: extra?.perRow ?? Math.max(1, Number(perRow) || 1),
      seatGap: extra?.seatGap ?? (Number(seatGap) || 0.55), rowGap: extra?.rowGap ?? (Number(rowGap) || 0.9),
      centralAisle: extra?.centralAisle ?? centralAisle, lateralAisles: extra?.lateralAisles ?? lateralAisles,
    });
  }

  function regenerate(extra?: Parameters<typeof doGenerate>[0]) { setErr(null); start(async () => { await doGenerate(extra); router.refresh(); }); }

  function quickAdd(z: { name: string; kind: string; color: string }) {
    const W = Number(width) || 20;
    const x = 1 + (zones.length % 4) * 2, y = 1; // posición inicial; el usuario la mueve
    const pts: [number, number][] = [[x, y], [Math.min(W - 1, x + 3), y], [Math.min(W - 1, x + 3), y + 2], [x, y + 2]];
    start(async () => { await saveZone({ mapId, name: z.name, kind: z.kind, color: z.color, points: pts, gaCapacity: null }); router.refresh(); });
  }

  function doPublish() { setPublishing(true); start(async () => { await publishMap(mapId); router.refresh(); setPublishing(false); }); }

  // Recomendaciones con indicadores (computadas + IA)
  const recs = useMemo(() => {
    const density = area > 0 ? capacity / area : 0;
    const lvl = (good: boolean, ok: boolean): "Excelente" | "Bueno" | "Mejorable" | "Crítico" => good ? "Excelente" : ok ? "Bueno" : "Mejorable";
    const out: { label: string; value: string; level: "Excelente" | "Bueno" | "Mejorable" | "Crítico"; icon: typeof Gauge }[] = [
      { label: "Capacidad", value: `${capacity} sillas`, level: capacity > 0 ? "Bueno" : "Mejorable", icon: Users },
      { label: "Densidad", value: `${density.toFixed(2)}/m²`, level: density <= 1.7 ? "Excelente" : density <= 2.2 ? "Bueno" : "Crítico", icon: Gauge },
      { label: "Salidas de emergencia", value: `${exits}`, level: exits >= 2 ? "Excelente" : exits === 1 ? "Mejorable" : "Crítico", icon: DoorOpen },
      { label: "Baños", value: `${baths}`, level: baths >= 1 ? "Bueno" : "Mejorable", icon: ShieldAlert },
      { label: "Visibilidad estimada", value: `${Math.max(40, 100 - Math.round((capacity / Math.max(1, Number(perRow))) * 1.5))}%`, level: lvl(capacity < 400, capacity < 800), icon: Eye },
    ];
    return out;
  }, [area, capacity, exits, baths, perRow]);

  const levelColor: Record<string, string> = { Excelente: "text-emerald-400 bg-emerald-500/10", Bueno: "text-sky-400 bg-sky-500/10", Mejorable: "text-amber-400 bg-amber-500/10", Crítico: "text-rose-400 bg-rose-500/10" };

  // ---------- PASO 1: SUBIR ----------
  if (step === "upload") {
    return (
      <div className="glass ring-grad rounded-3xl p-8">
        <Stepper active={0} />
        <div className="mx-auto mt-6 max-w-2xl text-center">
          <h2 className="font-display text-2xl font-bold">Crea tu recinto con IA</h2>
          <p className="mt-2 text-sm text-muted">Sube una foto del recinto, o créalo solo con sus datos: la IA genera el mapa y un modelo 3D profesional.</p>

          <div className="mx-auto mt-5 flex w-fit rounded-full border border-line p-0.5 text-sm">
            <button onClick={() => setMode("foto")} className={`rounded-full px-4 py-1.5 transition ${mode === "foto" ? "brand-gradient text-ink" : "text-muted"}`}>Subir foto</button>
            <button onClick={() => setMode("datos")} className={`rounded-full px-4 py-1.5 transition ${mode === "datos" ? "brand-gradient text-ink" : "text-muted"}`}>Crear sin foto</button>
          </div>

          {mode === "foto" ? (
            <>
              <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) uploadPhoto(f); }}
                className={`mt-5 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-6 py-12 transition ${drag ? "border-fuchsia bg-fuchsia/5" : "border-line hover:border-fuchsia/50"}`}>
                {bgUrl ? <img src={bgUrl} alt="Recinto" className="max-h-52 rounded-xl object-contain" /> : (
                  <><div className="brand-gradient grid h-14 w-14 place-items-center rounded-2xl text-ink">{uploading ? <Loader2 className="h-7 w-7 animate-spin" /> : <ImageUp className="h-7 w-7" />}</div>
                    <div className="font-medium">{uploading ? "Subiendo…" : "Arrastra una imagen o haz clic"}</div>
                    <div className="text-xs text-muted">JPG · PNG · WEBP</div></>)}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} />
              </label>
              {err && <p className="mt-3 text-sm text-fuchsia">{err}</p>}
              <div className="mt-6 flex justify-center gap-3">
                <button onClick={() => runAnalyzeAndGenerate(true)} disabled={!bgUrl || pending} className="brand-gradient flex items-center gap-2 rounded-2xl px-6 py-3 font-semibold text-ink disabled:opacity-40"><ScanSearch className="h-4 w-4" /> Analizar con IA</button>
                <button onClick={() => runAnalyzeAndGenerate(false)} disabled={pending} className="flex items-center gap-2 rounded-2xl border border-line px-6 py-3 text-sm font-medium transition hover:border-white/20">Continuar sin IA <ArrowRight className="h-4 w-4" /></button>
              </div>
            </>
          ) : (
            <div className="mt-5 text-left">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <L label="Tipo de recinto"><select value={eventType} onChange={(e) => setEventType(e.target.value)} className={fld}>{EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></L>
                <L label="Forma"><select value={shape} onChange={(e) => setShape(e.target.value)} className={fld}>{["Rectangular", "Cuadrada", "En L", "Abanico", "Circular"].map((s) => <option key={s}>{s}</option>)}</select></L>
                <L label="Escenario"><select value={stageSide} onChange={(e) => setStageSide(e.target.value)} className={fld}>{["Frente", "Centro", "Lateral", "Esquina"].map((s) => <option key={s}>{s}</option>)}</select></L>
                <L label={`Ancho (${unit})`}><input value={width} onChange={(e) => setWidth(e.target.value)} type="number" className={fld} /></L>
                <L label={`Largo (${unit})`}><input value={length} onChange={(e) => setLength(e.target.value)} type="number" className={fld} /></L>
                <L label={`Altura (${unit})`}><input value={height} onChange={(e) => setHeight(e.target.value)} type="number" className={fld} /></L>
                <L label="Columnas"><input value={columns} onChange={(e) => setColumns(e.target.value)} type="number" className={fld} /></L>
                <L label="Sillas"><input value={chairs} onChange={(e) => setChairs(e.target.value)} type="number" className={fld} /></L>
                <L label="Por fila"><input value={perRow} onChange={(e) => setPerRow(e.target.value)} type="number" className={fld} /></L>
              </div>
              {err && <p className="mt-3 text-sm text-fuchsia">{err}</p>}
              <button onClick={() => runAnalyzeAndGenerate(false)} disabled={pending} className="brand-gradient mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3 font-semibold text-ink disabled:opacity-50"><Wand2 className="h-4 w-4" /> Generar recinto 3D</button>
              <p className="mt-2 text-center text-[11px] text-muted">La IA construye el mapa + modelo 3D con muros, escenario, columnas, zonas y distribución según tus datos.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- PASO 2: ANALIZANDO ----------
  if (step === "analyzing") {
    const pct = Math.round(((stepIdx + 1) / ANALYZE_STEPS.length) * 100);
    return (
      <div className="glass ring-grad rounded-3xl p-8">
        <Stepper active={1} />
        <div className="mx-auto mt-6 max-w-xl">
          <div className="mb-4 flex items-center gap-2 font-display text-lg font-semibold text-fuchsia"><Sparkles className="h-5 w-5 animate-pulse" /> La IA está analizando tu recinto…</div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2"><div className="brand-gradient h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} /></div>
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-1.5">
            {ANALYZE_STEPS.map((s, i) => (
              <div key={i} className={`flex items-center gap-2 text-sm transition ${i < stepIdx ? "text-emerald-300" : i === stepIdx ? "text-fg" : "text-muted/40"}`}>
                {i < stepIdx ? <Check className="h-4 w-4" /> : i === stepIdx ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-4 w-4 rounded-full border border-line" />}{s}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---------- PASO 3: ESTUDIO ----------
  return (
    <div className="space-y-4">
      <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
        <Stepper active={2} compact />
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${status === "published" ? "bg-emerald-500/10 text-emerald-300" : "bg-surface-2 text-muted"}`}>{status === "published" ? "Publicado" : "Borrador"}</span>
          <button onClick={doPublish} disabled={pending} className="brand-gradient flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">{publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Publicar mapa</button>
        </div>
      </div>

      {err && <p className="text-sm text-fuchsia">{err}</p>}

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        {/* Centro: plano editable */}
        <div className="min-w-0">
          <MapEditor mapId={mapId} widthM={widthM} heightM={heightM} status={status} backgroundUrl={backgroundUrl} initialZones={zones} initialSeats={seats} />
        </div>

        {/* Panel derecho */}
        <div className="space-y-3">
          <Panel title="Dimensiones">
            <div className="grid grid-cols-3 gap-2">
              <L label="Ancho"><input value={width} onChange={(e) => setWidth(e.target.value)} type="number" className={fld} /></L>
              <L label="Largo"><input value={length} onChange={(e) => setLength(e.target.value)} type="number" className={fld} /></L>
              <L label="Alto"><input value={height} onChange={(e) => setHeight(e.target.value)} type="number" className={fld} /></L>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted"><span>Área total</span><span className="text-fg">{area.toLocaleString("es-MX")} {unit}²</span></div>
            <L label="Unidad"><select value={unit} onChange={(e) => setUnit(e.target.value as "m" | "ft")} className={fld}><option value="m">metros</option><option value="ft">pies</option></select></L>
          </Panel>

          <Panel title="Tipo de evento">
            <select value={eventType} onChange={(e) => setEventType(e.target.value)} className={fld}>{EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </Panel>

          <Panel title="Distribución">
            <div className="grid grid-cols-2 gap-2">
              <L label="Sillas"><input value={chairs} onChange={(e) => setChairs(e.target.value)} type="number" className={fld} /></L>
              <L label="Por fila"><input value={perRow} onChange={(e) => setPerRow(e.target.value)} type="number" className={fld} /></L>
              <L label={`Sep. sillas (${unit})`}><input value={seatGap} onChange={(e) => setSeatGap(e.target.value)} type="number" step="0.05" className={fld} /></L>
              <L label={`Sep. filas (${unit})`}><input value={rowGap} onChange={(e) => setRowGap(e.target.value)} type="number" step="0.05" className={fld} /></L>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <Toggle on={centralAisle} onClick={() => setCentralAisle((v) => !v)}>Pasillo central</Toggle>
              <Toggle on={lateralAisles} onClick={() => setLateralAisles((v) => !v)}>Pasillos laterales</Toggle>
            </div>
            <button onClick={() => regenerate()} disabled={pending} className="brand-gradient mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-ink disabled:opacity-50">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Generar / Optimizar</button>
          </Panel>

          <Panel title="Recomendaciones IA">
            <div className="space-y-1.5">
              {recs.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 text-muted"><r.icon className="h-3.5 w-3.5" /> {r.label}</span>
                  <span className="flex items-center gap-1.5"><span className="text-fg">{r.value}</span><span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${levelColor[r.level]}`}>{r.level}</span></span>
                </div>
              ))}
            </div>
            {analysis?.recommendations?.length ? <ul className="mt-2 space-y-0.5 border-t border-line pt-2 text-[11px] text-muted">{analysis.recommendations.slice(0, 4).map((r, i) => <li key={i}>• {r}</li>)}</ul> : null}
          </Panel>

          <Panel title="Capacidad por tipo">
            <div className="space-y-1">
              {capacityMatrix(area).map((c) => (
                <div key={c.key} className="flex items-center justify-between text-xs">
                  <span className="text-muted">{c.label}</span>
                  <span className="font-display font-bold tabular-nums text-fg">{c.people.toLocaleString("es-MX")}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted/70">Calculado sobre el área útil ({Math.round(area * 0.65)} {unit}²). Se recalcula al cambiar dimensiones.</p>
          </Panel>

          <Panel title="Acciones rápidas IA">
            <div className="flex flex-wrap gap-1.5">
              {QUICK.map((q) => <button key={q.name} onClick={() => quickAdd(q)} disabled={pending} className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] transition hover:border-fuchsia/50 disabled:opacity-50"><Plus className="h-3 w-3" /> {q.name}</button>)}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <Quick onClick={() => regenerate()} >Optimizar distribución</Quick>
              <Quick onClick={() => regenerate({ seatGap: (Number(seatGap) || 0.55) * 0.9, rowGap: (Number(rowGap) || 0.9) * 0.9 })}>Maximizar capacidad</Quick>
              <Quick onClick={() => { setCentralAisle(true); setLateralAisles(true); regenerate({ centralAisle: true, lateralAisles: true, rowGap: (Number(rowGap) || 0.9) * 1.1 }); }}>Mejorar circulación</Quick>
              <Quick onClick={() => regenerate({ perRow: Math.max(1, Math.round((Number(perRow) || 20) * 0.85)) })}>Mejorar visibilidad</Quick>
            </div>
          </Panel>

          {bgUrl && (
            <Panel title="Foto original → Mapa IA">
              <img src={bgUrl} alt="Recinto" className="w-full rounded-lg object-contain" />
            </Panel>
          )}
        </div>
      </div>

      {/* Modelo 3D WebGL real */}
      <VenueModel3D widthM={widthM} heightM={heightM} wallHeight={Number(height) || 4} zones={zones} seats={seats} columns={Number(columns) || 0} />

      {/* Vista 2D/3D plano + exportar */}
      <VenueViewer name={name} widthM={widthM} heightM={heightM} zones={zones} seats={seats} />
    </div>
  );
}

function Stepper({ active, compact }: { active: number; compact?: boolean }) {
  const labels = ["Subir foto", "IA analizando", "Mapa generado"];
  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "justify-center"}`}>
      {labels.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${i <= active ? "brand-gradient text-ink" : "bg-surface-2 text-muted"}`}>{i < active ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
          {!compact && <span className={`text-sm ${i === active ? "text-fg" : "text-muted"}`}>{l}</span>}
          {i < 2 && <span className="h-px w-6 bg-line" />}
        </div>
      ))}
    </div>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="glass rounded-2xl p-3.5"><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>{children}</div>;
}
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="mb-1 text-[11px] text-muted">{label}</div>{children}</div>;
}
function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition ${on ? "bg-fuchsia/15 text-fuchsia" : "border border-line text-muted"}`}>{on && <Check className="h-3 w-3" />}{children}</button>;
}
function Quick({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className="rounded-lg border border-line px-2 py-1.5 text-[11px] transition hover:border-fuchsia/50">{children}</button>;
}
