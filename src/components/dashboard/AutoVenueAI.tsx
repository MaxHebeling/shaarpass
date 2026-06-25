"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ImageUp, Loader2, Wand2, Check, AlertTriangle, ShieldCheck, ScanSearch, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { autoGenerateLayout, setMapBackground } from "@/app/dashboard/recintos/actions";

interface Summary { capacity: number; placed: number; rows: number; perRow: number; accesses: number; exits: number; specialZones: string[]; warnings: string[]; recommendations: string[]; }
interface Analysis { shapeNotes?: string; stageSide?: string; blockedAreas?: string[]; entrancesNotes?: string; suggestedPerRow?: number; centralAisle?: boolean; lateralAisles?: boolean; estimatedCapacity?: number; zones?: string[]; recommendations?: string[]; }

const field = "w-full rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60";
const STEPS = ["Analizando estructura del recinto", "Detectando dimensiones aproximadas", "Reconociendo entradas y salidas", "Identificando columnas y espacios bloqueados", "Detectando ubicación del escenario", "Calculando capacidad estimada", "Generando distribución inicial"];

export function AutoVenueAI({ mapId, defaultWidth, defaultHeight, backgroundUrl }: {
  mapId: string; defaultWidth: number; defaultHeight: number; backgroundUrl: string | null;
}) {
  const [unit, setUnit] = useState<"m" | "ft">("m");
  const [width, setWidth] = useState(String(defaultWidth || 20));
  const [length, setLength] = useState(String(defaultHeight || 30));
  const [chairs, setChairs] = useState("300");
  const [perRow, setPerRow] = useState("20");
  const [seatGap, setSeatGap] = useState("0.55");
  const [rowGap, setRowGap] = useState("0.9");
  const [centralAisle, setCentralAisle] = useState(true);
  const [lateralAisles, setLateralAisles] = useState(true);
  const [bgUrl, setBgUrl] = useState<string | null>(backgroundUrl);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [step, setStep] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (stepTimer.current) clearInterval(stepTimer.current); }, []);

  async function uploadPhoto(file: File) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setErr("Formato no válido (JPG, PNG o WEBP)"); return; }
    setUploading(true); setErr(null);
    try {
      const db = createClient();
      const path = `${mapId}/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, "_")}`;
      const { error: upErr } = await db.storage.from("venue-plans").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = db.storage.from("venue-plans").getPublicUrl(path);
      const res = await setMapBackground(mapId, data.publicUrl);
      if (res?.error) throw new Error(res.error);
      setBgUrl(data.publicUrl); router.refresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setUploading(false); }
  }

  async function analyze() {
    if (!bgUrl) { setErr("Sube primero una foto del recinto"); return; }
    setErr(null); setAnalysis(null); setAnalyzing(true); setStep(0);
    stepTimer.current = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 850);
    try {
      const r = await fetch("/api/venue/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: bgUrl, widthM: Number(width), lengthM: Number(length), totalChairs: Number(chairs), unit }),
      });
      const d = await r.json();
      if (d.reason === "no_key") { setErr("El análisis con IA necesita configurar ANTHROPIC_API_KEY. Mientras tanto, usa 'Generar mapa' con tus medidas."); return; }
      if (!r.ok || !d.ok) { setErr(d.error || "No se pudo analizar la imagen"); return; }
      const a: Analysis = d.analysis;
      setAnalysis(a);
      // Aplica sugerencias de la IA al formulario.
      if (a.suggestedPerRow) setPerRow(String(a.suggestedPerRow));
      if (typeof a.centralAisle === "boolean") setCentralAisle(a.centralAisle);
      if (typeof a.lateralAisles === "boolean") setLateralAisles(a.lateralAisles);
    } catch (e) { setErr((e as Error).message); }
    finally { if (stepTimer.current) clearInterval(stepTimer.current); setAnalyzing(false); }
  }

  function generate() {
    setErr(null);
    start(async () => {
      const res = await autoGenerateLayout({
        mapId, widthM: Number(width) || 20, lengthM: Number(length) || 30, unit,
        totalChairs: Math.max(1, Number(chairs) || 0), perRow: Math.max(1, Number(perRow) || 1),
        seatGap: Number(seatGap) || 0.55, rowGap: Number(rowGap) || 0.9, centralAisle, lateralAisles,
      });
      if ("error" in res && res.error) { setErr(res.error); return; }
      if ("summary" in res && res.summary) setSummary(res.summary);
      router.refresh();
    });
  }

  return (
    <div className="glass ring-grad mb-6 rounded-3xl p-6">
      <div className="mb-1 flex items-center gap-2"><Sparkles className="h-5 w-5 text-gold" /><h2 className="font-display text-lg font-semibold">Crea tu mapa con IA</h2></div>
      <p className="mb-5 text-sm text-muted">Sube una foto clara del recinto y la IA generará una propuesta inicial de distribución.</p>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        {/* Foto (drag&drop + preview) + medidas */}
        <div className="space-y-4">
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) uploadPhoto(f); }}
            className={`relative flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed px-4 py-6 text-center text-sm transition ${drag ? "border-fuchsia bg-fuchsia/5" : bgUrl ? "border-line" : "border-line bg-surface/40 text-muted hover:border-fuchsia/50"}`}>
            {bgUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bgUrl} alt="Recinto" className="max-h-44 w-full rounded-xl object-contain" />
            ) : (
              <>{uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImageUp className="h-6 w-6" />}
                <span>{uploading ? "Subiendo…" : "Arrastra una foto aquí o haz clic"}</span>
                <span className="text-[11px] text-muted/70">JPG · PNG · WEBP</span></>
            )}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} />
          </label>
          {bgUrl && <button onClick={analyze} disabled={analyzing} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-fuchsia/40 py-2.5 text-sm font-semibold text-fuchsia transition hover:bg-fuchsia/10 disabled:opacity-50">{analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />} Analizar con IA</button>}

          <div className="grid grid-cols-3 gap-2">
            <div><div className="mb-1 text-xs text-muted">Ancho</div><input value={width} onChange={(e) => setWidth(e.target.value)} type="number" className={field} /></div>
            <div><div className="mb-1 text-xs text-muted">Largo</div><input value={length} onChange={(e) => setLength(e.target.value)} type="number" className={field} /></div>
            <div><div className="mb-1 text-xs text-muted">Unidad</div><select value={unit} onChange={(e) => setUnit(e.target.value as "m" | "ft")} className={field}><option value="m">metros</option><option value="ft">pies</option></select></div>
          </div>
        </div>

        {/* Sillas + pasillos / proceso IA */}
        <div className="space-y-3">
          {analyzing ? (
            <div className="rounded-2xl border border-line bg-surface/40 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-fuchsia"><ScanSearch className="h-4 w-4 animate-pulse" /> La IA está analizando el recinto…</div>
              {STEPS.map((s, i) => (
                <div key={i} className={`flex items-center gap-2 py-1 text-xs ${i < step ? "text-emerald-300" : i === step ? "text-fg" : "text-muted/50"}`}>
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i === step ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-3.5 w-3.5" />}{s}
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div><div className="mb-1 text-xs text-muted">Sillas totales</div><input value={chairs} onChange={(e) => setChairs(e.target.value)} type="number" className={field} /></div>
                <div><div className="mb-1 text-xs text-muted">Sillas por fila</div><input value={perRow} onChange={(e) => setPerRow(e.target.value)} type="number" className={field} /></div>
                <div><div className="mb-1 text-xs text-muted">Separación sillas ({unit})</div><input value={seatGap} onChange={(e) => setSeatGap(e.target.value)} type="number" step="0.05" className={field} /></div>
                <div><div className="mb-1 text-xs text-muted">Separación filas ({unit})</div><input value={rowGap} onChange={(e) => setRowGap(e.target.value)} type="number" step="0.05" className={field} /></div>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <button onClick={() => setCentralAisle((v) => !v)} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${centralAisle ? "bg-fuchsia/15 text-fuchsia" : "border border-line text-muted"}`}>{centralAisle && <Check className="h-3.5 w-3.5" />} Pasillo central</button>
                <button onClick={() => setLateralAisles((v) => !v)} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${lateralAisles ? "bg-fuchsia/15 text-fuchsia" : "border border-line text-muted"}`}>{lateralAisles && <Check className="h-3.5 w-3.5" />} Pasillos laterales</button>
              </div>
            </>
          )}

          {analysis && (
            <div className="rounded-2xl border border-fuchsia/30 bg-fuchsia/5 p-4 text-xs">
              <div className="mb-1 flex items-center gap-1.5 font-medium text-fuchsia"><Sparkles className="h-3.5 w-3.5" /> Análisis de la IA</div>
              {analysis.shapeNotes && <p className="text-muted">{analysis.shapeNotes}</p>}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted">
                {analysis.estimatedCapacity != null && <span>Capacidad estimada: <strong className="text-fg">{analysis.estimatedCapacity}</strong></span>}
                {analysis.stageSide && <span>Escenario: <strong className="text-fg">{analysis.stageSide}</strong></span>}
                {analysis.suggestedPerRow && <span>Sillas/fila sugeridas: <strong className="text-fg">{analysis.suggestedPerRow}</strong></span>}
              </div>
              {analysis.blockedAreas?.length ? <p className="mt-1 text-amber-400">⚠ Zonas bloqueadas: {analysis.blockedAreas.join(", ")}</p> : null}
              {analysis.recommendations?.length ? <ul className="mt-2 space-y-0.5 text-muted">{analysis.recommendations.map((r, i) => <li key={i}>• {r}</li>)}</ul> : null}
              <p className="mt-2 text-emerald-300">Apliqué sus sugerencias al formulario. Ajusta y pulsa “Generar mapa”.</p>
            </div>
          )}
        </div>
      </div>

      {err && <p className="mt-3 text-sm text-fuchsia">{err}</p>}

      <button onClick={generate} disabled={pending || analyzing} className="brand-gradient mt-5 flex items-center gap-2 rounded-2xl px-6 py-3 font-semibold text-ink disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}{summary ? "Optimizar distribución con IA" : "Generar mapa"}
      </button>

      {summary && (
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          {/* Vista comparativa: foto vs mapa (el mapa editable está debajo) */}
          {bgUrl && (
            <div className="rounded-2xl border border-line bg-surface/40 p-3">
              <div className="mb-2 flex items-center justify-center gap-2 text-xs text-muted">Foto original <ArrowRight className="h-3 w-3" /> Mapa (abajo)</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bgUrl} alt="Recinto" className="max-h-40 w-full rounded-lg object-contain" />
            </div>
          )}
          <div className="rounded-2xl border border-line bg-surface/40 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Capacidad" value={summary.capacity.toLocaleString("es-MX")} />
              <Stat label="Filas" value={`${summary.rows} × ${summary.perRow}`} />
              <Stat label="Accesos" value={String(summary.accesses)} />
              <Stat label="Salidas" value={String(summary.exits)} />
            </div>
            <div className="mt-3 text-xs text-muted">Zonas: {summary.specialZones.join(" · ")}</div>
            {summary.warnings.map((w, i) => <p key={i} className="mt-2 flex items-start gap-1.5 text-xs text-amber-400"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}</p>)}
            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted"><ShieldCheck className="h-3.5 w-3.5 text-gold" /> Recomendaciones</div>
              {summary.recommendations.map((r, i) => <p key={i} className="text-xs text-muted">• {r}</p>)}
            </div>
            <p className="mt-3 text-xs text-emerald-300">✅ Mapa generado. Edítalo abajo: mueve sillas, zonas, escenario, accesos…</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-surface/40 px-3 py-2 text-center"><div className="font-display text-xl font-bold">{value}</div><div className="text-[10px] text-muted">{label}</div></div>;
}
