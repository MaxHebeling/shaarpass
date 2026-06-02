"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MousePointer2, PencilRuler, Trash2, Rocket, Loader2, Armchair, X } from "lucide-react";
import { saveZone, generateZoneSeats, deleteZone, publishMap } from "@/app/dashboard/recintos/actions";

export interface EditorZone { id: string; name: string; kind: string; color: string; gaCapacity: number | null; points: [number, number][]; }
export interface EditorSeat { id: string; zoneId: string; label: string; x: number; y: number; }

const field = "rounded-lg border border-line bg-surface/60 px-2.5 py-2 text-sm outline-none focus:border-fuchsia/60";
const KINDS = [["seated", "Con asientos"], ["ga", "General (de pie)"], ["table", "Mesas"], ["standing", "Palco/zona"]] as const;
const COLORS = ["#7c3aed", "#d6219b", "#f5c451", "#10b981", "#3b82f6", "#ef4444"];

export function MapEditor({
  mapId, widthM, heightM, status, backgroundUrl, initialZones, initialSeats,
}: { mapId: string; widthM: number; heightM: number; status: string; backgroundUrl: string | null; initialZones: EditorZone[]; initialSeats: EditorSeat[]; }) {
  const [mode, setMode] = useState<"select" | "draw">("select");
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [pendingPoints, setPendingPoints] = useState<[number, number][] | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const svgRef = useRef<SVGSVGElement>(null);
  const router = useRouter();

  // form de zona nueva
  const [zName, setZName] = useState("");
  const [zKind, setZKind] = useState("seated");
  const [zColor, setZColor] = useState("#7c3aed");
  const [zCap, setZCap] = useState(100);

  // form de asientos
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(10);
  const [rowStart, setRowStart] = useState("A");
  const [dx, setDx] = useState(1);
  const [dy, setDy] = useState(1);

  const colorByZone = useMemo(() => new Map(initialZones.map((z) => [z.id, z.color])), [initialZones]);
  const selected = initialZones.find((z) => z.id === selectedZone) ?? null;

  function toMeters(e: React.MouseEvent) {
    const rect = svgRef.current!.getBoundingClientRect();
    return [
      Math.round(((e.clientX - rect.left) / rect.width) * widthM * 10) / 10,
      Math.round(((e.clientY - rect.top) / rect.height) * heightM * 10) / 10,
    ] as [number, number];
  }

  function onCanvasClick(e: React.MouseEvent) {
    if (mode !== "draw") { setSelectedZone(null); return; }
    setDraft((d) => [...d, toMeters(e)]);
  }

  function finishZone() {
    if (draft.length < 3) return;
    setPendingPoints(draft);
    setDraft([]);
    setMode("select");
  }

  function confirmZone() {
    if (!pendingPoints) return;
    setError(null);
    start(async () => {
      const res = await saveZone({ mapId, name: zName || "Zona", kind: zKind, color: zColor, points: pendingPoints, gaCapacity: zKind === "ga" || zKind === "standing" ? zCap : null });
      if (res?.error) { setError(res.error); return; }
      setPendingPoints(null); setZName("");
      router.refresh();
    });
  }

  function genSeats() {
    if (!selected) return;
    const xs = selected.points.map((p) => p[0]); const ys = selected.points.map((p) => p[1]);
    const originX = Math.min(...xs) + 1; const originY = Math.min(...ys) + 1;
    setError(null);
    start(async () => {
      const res = await generateZoneSeats({ mapId, zoneId: selected.id, rows, cols, rowStart, seatStart: 1, originX, originY, dx, dy });
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  function removeZone() {
    if (!selected) return;
    start(async () => { await deleteZone(mapId, selected.id); setSelectedZone(null); router.refresh(); });
  }

  function publish() { start(async () => { await publishMap(mapId); router.refresh(); }); }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      {/* Lienzo */}
      <div className="glass overflow-hidden rounded-3xl p-3">
        <div className="mb-3 flex items-center gap-2">
          <button onClick={() => { setMode("select"); setDraft([]); }} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${mode === "select" ? "brand-gradient text-ink" : "border border-line text-muted"}`}>
            <MousePointer2 className="h-4 w-4" /> Seleccionar
          </button>
          <button onClick={() => { setMode("draw"); setSelectedZone(null); }} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${mode === "draw" ? "brand-gradient text-ink" : "border border-line text-muted"}`}>
            <PencilRuler className="h-4 w-4" /> Dibujar zona
          </button>
          {mode === "draw" && (
            <button onClick={finishZone} disabled={draft.length < 3} className="rounded-lg border border-gold/40 px-3 py-1.5 text-sm text-gold disabled:opacity-40">
              Cerrar zona ({draft.length})
            </button>
          )}
        </div>

        <svg
          ref={svgRef} onClick={onCanvasClick}
          viewBox={`0 0 ${widthM} ${heightM}`}
          style={{ aspectRatio: `${widthM}/${heightM}`, cursor: mode === "draw" ? "crosshair" : "default" }}
          className="w-full rounded-2xl bg-ink-2"
        >
          {backgroundUrl && <image href={backgroundUrl} x={0} y={0} width={widthM} height={heightM} opacity={0.5} preserveAspectRatio="none" />}
          {/* grid */}
          {Array.from({ length: Math.floor(widthM / 5) + 1 }).map((_, i) => (
            <line key={`v${i}`} x1={i * 5} y1={0} x2={i * 5} y2={heightM} stroke="#26263a" strokeWidth={0.05} />
          ))}
          {Array.from({ length: Math.floor(heightM / 5) + 1 }).map((_, i) => (
            <line key={`h${i}`} x1={0} y1={i * 5} x2={widthM} y2={i * 5} stroke="#26263a" strokeWidth={0.05} />
          ))}

          {/* zonas */}
          {initialZones.map((z) => (
            <polygon
              key={z.id}
              points={z.points.map((p) => p.join(",")).join(" ")}
              fill={z.color} fillOpacity={selectedZone === z.id ? 0.45 : 0.22}
              stroke={z.color} strokeWidth={selectedZone === z.id ? 0.25 : 0.12}
              onClick={(e) => { if (mode === "select") { e.stopPropagation(); setSelectedZone(z.id); } }}
              style={{ cursor: mode === "select" ? "pointer" : "crosshair" }}
            />
          ))}

          {/* asientos */}
          {initialSeats.map((s) => (
            <circle key={s.id} cx={s.x} cy={s.y} r={0.35} fill={colorByZone.get(s.zoneId) ?? "#9a9ab0"} fillOpacity={0.9} />
          ))}

          {/* draft en curso */}
          {draft.length > 0 && (
            <>
              <polyline points={draft.map((p) => p.join(",")).join(" ")} fill="none" stroke="#f5c451" strokeWidth={0.15} strokeDasharray="0.4 0.3" />
              {draft.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={0.3} fill="#f5c451" />)}
            </>
          )}
        </svg>
        <p className="mt-2 text-xs text-muted">
          {mode === "draw" ? "Haz clic para colocar vértices; luego “Cerrar zona”." : "Clic en una zona para seleccionarla."}
        </p>
      </div>

      {/* Panel */}
      <div className="space-y-4">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Estado</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${status === "published" ? "bg-emerald-500/10 text-emerald-300" : "bg-surface-2 text-muted"}`}>
              {status === "published" ? "Publicado" : "Borrador"}
            </span>
          </div>
          <button onClick={publish} disabled={pending} className="brand-gradient mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-ink disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Publicar mapa
          </button>
        </div>

        {error && <p className="text-sm text-fuchsia">{error}</p>}

        {/* Form de zona nueva */}
        {pendingPoints && (
          <div className="glass rounded-2xl p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display font-semibold">Nueva zona</h3>
              <button onClick={() => setPendingPoints(null)} className="text-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2">
              <input value={zName} onChange={(e) => setZName(e.target.value)} placeholder="Nombre (ej. Platea)" className={`${field} w-full`} />
              <select value={zKind} onChange={(e) => setZKind(e.target.value)} className={`${field} w-full`}>
                {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {(zKind === "ga" || zKind === "standing") && (
                <input type="number" value={zCap} onChange={(e) => setZCap(Number(e.target.value))} placeholder="Capacidad" className={`${field} w-full`} />
              )}
              <div className="flex gap-1.5">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setZColor(c)} style={{ background: c }} className={`h-7 w-7 rounded-full ${zColor === c ? "ring-2 ring-white" : ""}`} />
                ))}
              </div>
              <button onClick={confirmZone} disabled={pending} className="brand-gradient flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-ink disabled:opacity-50">
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} Guardar zona
              </button>
            </div>
          </div>
        )}

        {/* Zona seleccionada */}
        {selected && !pendingPoints && (
          <div className="glass rounded-2xl p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display font-semibold" style={{ color: selected.color }}>{selected.name}</h3>
              <button onClick={removeZone} className="text-muted transition hover:text-fuchsia"><Trash2 className="h-4 w-4" /></button>
            </div>
            <p className="mb-3 text-xs text-muted">{KINDS.find(([k]) => k === selected.kind)?.[1]} · {initialSeats.filter((s) => s.zoneId === selected.id).length} asientos</p>

            {selected.kind === "seated" && (
              <div className="space-y-2 border-t border-line pt-3">
                <div className="flex items-center gap-1.5 text-sm font-medium"><Armchair className="h-4 w-4 text-gold" /> Generar asientos</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-muted">Filas<input type="number" min={1} value={rows} onChange={(e) => setRows(Number(e.target.value))} className={`${field} mt-1 w-full`} /></label>
                  <label className="text-xs text-muted">Columnas<input type="number" min={1} value={cols} onChange={(e) => setCols(Number(e.target.value))} className={`${field} mt-1 w-full`} /></label>
                  <label className="text-xs text-muted">Fila inicial<input value={rowStart} maxLength={1} onChange={(e) => setRowStart(e.target.value.toUpperCase())} className={`${field} mt-1 w-full`} /></label>
                  <label className="text-xs text-muted">Sep. (m)<input type="number" step="0.1" value={dx} onChange={(e) => { setDx(Number(e.target.value)); setDy(Number(e.target.value)); }} className={`${field} mt-1 w-full`} /></label>
                </div>
                <button onClick={genSeats} disabled={pending} className="brand-gradient flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-ink disabled:opacity-50">
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Generar {rows * cols} asientos
                </button>
              </div>
            )}
          </div>
        )}

        <div className="glass rounded-2xl p-4 text-sm">
          <div className="mb-2 text-muted">Zonas ({initialZones.length})</div>
          {initialZones.map((z) => (
            <button key={z.id} onClick={() => setSelectedZone(z.id)} className="flex w-full items-center justify-between py-1 text-left">
              <span className="flex items-center gap-2"><i className="h-3 w-3 rounded" style={{ background: z.color }} /> {z.name}</span>
              <span className="text-xs text-muted">{initialSeats.filter((s) => s.zoneId === z.id).length}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
