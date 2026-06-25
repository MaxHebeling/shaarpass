"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, Download, ImageIcon, RotateCcw } from "lucide-react";

const EVENT_TYPES = ["Conferencia", "Congreso", "Iglesia", "Concierto", "Boda", "Banquete", "Expo", "Teatro", "Graduación", "Cena de gala", "Auditorio", "Salón de eventos"];
const STYLES = ["Moderno", "Elegante", "Minimalista", "Lujo", "Cálido / acogedor", "Industrial", "Clásico"];
const VIEWS = [{ k: "Cenital (planta)", v: "top-down aerial floor plan view, camera straight above 90 degrees" }, { k: "Frontal", v: "front view from the audience toward the stage" }, { k: "Isométrica", v: "isometric 3D view" }, { k: "Interior", v: "wide interior view at eye level" }];
const RATIOS = ["4:3", "16:9", "1:1", "3:2"];
const fld = "w-full rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60";

export function RenderStudio() {
  const [eventType, setEventType] = useState("Conferencia");
  const [style, setStyle] = useState("Moderno");
  const [view, setView] = useState(VIEWS[0].v);
  const [width, setWidth] = useState("20");
  const [length, setLength] = useState("30");
  const [capacity, setCapacity] = useState("500");
  const [details, setDetails] = useState("");
  const [ratio, setRatio] = useState("4:3");
  const [prompt, setPrompt] = useState("");
  const touched = useRef(false);
  const [img, setImg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Los datos arman el prompt automáticamente (hasta que el usuario lo edite a mano).
  function compose() {
    return `Event space "${eventType}" for ${capacity || "?"} people, ${width}m x ${length}m, ${style.toLowerCase()} style, ${VIEWS.find((v) => v.v === view)?.k.toLowerCase()}. ${details ? details + ". " : ""}Stage, rows of seating, aisles, entrances and exits, lighting rig`;
  }
  useEffect(() => { if (!touched.current) setPrompt(compose()); /* eslint-disable-next-line */ }, [eventType, style, view, width, length, capacity, details]);

  async function generate() {
    setLoading(true); setErr(null); setImg(null);
    try {
      const r = await fetch("/api/venue/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, aspectRatio: ratio }) });
      const d = await r.json();
      if (d.reason === "no_key") setErr(d.message || "Configura REPLICATE_API_TOKEN.");
      else if (!d.ok || !d.image) setErr(d.error || "No se pudo generar el render");
      else setImg(d.image);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      {/* Datos → prompt */}
      <div className="glass rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-2"><Sparkles className="h-5 w-5 text-gold" /><h2 className="font-display text-lg font-semibold">Datos del render</h2></div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <L label="Tipo de evento"><select value={eventType} onChange={(e) => setEventType(e.target.value)} className={fld}>{EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></L>
            <L label="Estilo"><select value={style} onChange={(e) => setStyle(e.target.value)} className={fld}>{STYLES.map((t) => <option key={t}>{t}</option>)}</select></L>
            <L label="Ancho (m)"><input value={width} onChange={(e) => setWidth(e.target.value)} type="number" className={fld} /></L>
            <L label="Largo (m)"><input value={length} onChange={(e) => setLength(e.target.value)} type="number" className={fld} /></L>
            <L label="Capacidad"><input value={capacity} onChange={(e) => setCapacity(e.target.value)} type="number" className={fld} /></L>
            <L label="Formato"><select value={ratio} onChange={(e) => setRatio(e.target.value)} className={fld}>{RATIOS.map((t) => <option key={t}>{t}</option>)}</select></L>
          </div>
          <L label="Vista"><select value={view} onChange={(e) => setView(e.target.value)} className={fld}>{VIEWS.map((v) => <option key={v.k} value={v.v}>{v.k}</option>)}</select></L>
          <L label="Detalles (elementos, ambiente, colores…)"><textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} className={fld} placeholder="Ej: dos pantallas LED, área VIP, iluminación cálida, plantas, alfombra azul" /></L>

          <div>
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
              <span>Prompt (editable)</span>
              <button onClick={() => { touched.current = false; setPrompt(compose()); }} className="flex items-center gap-1 hover:text-fg"><RotateCcw className="h-3 w-3" /> desde datos</button>
            </div>
            <textarea value={prompt} onChange={(e) => { touched.current = true; setPrompt(e.target.value); }} rows={4} className={fld} />
          </div>

          {err && <p className="text-sm text-amber-400">{err}</p>}
          <button onClick={generate} disabled={loading || !prompt.trim()} className="brand-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3 font-semibold text-ink disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generar render
          </button>
        </div>
      </div>

      {/* Resultado */}
      <div className="glass grid min-h-[400px] place-items-center rounded-3xl p-5">
        {loading ? (
          <div className="text-center text-muted"><Loader2 className="mx-auto h-8 w-8 animate-spin" /><p className="mt-3 text-sm">Generando render fotorrealista…</p></div>
        ) : img ? (
          <div className="w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt="Render del recinto" className="mx-auto max-h-[70vh] w-full rounded-2xl object-contain" />
            <div className="mt-3 flex items-center justify-between text-xs text-muted">
              <span>Render generado por IA (Replicate)</span>
              <a href={img} download="render.png" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 transition hover:border-white/20"><Download className="h-3.5 w-3.5" /> Descargar</a>
            </div>
          </div>
        ) : (
          <div className="text-center text-muted"><ImageIcon className="mx-auto h-10 w-10 opacity-40" /><p className="mt-3 text-sm">Carga los datos y pulsa “Generar render”.</p></div>
        )}
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="mb-1 text-[11px] text-muted">{label}</div>{children}</div>;
}
