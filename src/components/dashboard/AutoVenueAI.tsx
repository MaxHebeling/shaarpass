"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ImageUp, Loader2, Wand2, Check, AlertTriangle, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { autoGenerateLayout, setMapBackground } from "@/app/dashboard/recintos/actions";

interface Summary {
  capacity: number; placed: number; rows: number; perRow: number;
  accesses: number; exits: number; specialZones: string[]; warnings: string[]; recommendations: string[];
}
const field = "w-full rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60";

export function AutoVenueAI({ mapId, defaultWidth, defaultHeight, hasBackground }: {
  mapId: string; defaultWidth: number; defaultHeight: number; hasBackground: boolean;
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
  const [uploaded, setUploaded] = useState(hasBackground);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  async function uploadPhoto(file: File) {
    setUploading(true); setErr(null);
    try {
      const db = createClient();
      const path = `${mapId}/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, "_")}`;
      const { error: upErr } = await db.storage.from("venue-plans").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = db.storage.from("venue-plans").getPublicUrl(path);
      const res = await setMapBackground(mapId, data.publicUrl);
      if (res?.error) throw new Error(res.error);
      setUploaded(true); router.refresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setUploading(false); }
  }

  function generate() {
    setErr(null);
    start(async () => {
      const res = await autoGenerateLayout({
        mapId, widthM: Number(width) || 20, lengthM: Number(length) || 30, unit,
        totalChairs: Math.max(1, Number(chairs) || 0), perRow: Math.max(1, Number(perRow) || 1),
        seatGap: Number(seatGap) || 0.55, rowGap: Number(rowGap) || 0.9,
        centralAisle, lateralAisles,
      });
      if ("error" in res && res.error) { setErr(res.error); return; }
      if ("summary" in res && res.summary) setSummary(res.summary);
      router.refresh(); // el editor de abajo se actualiza con la nueva propuesta
    });
  }

  return (
    <div className="glass ring-grad mb-6 rounded-3xl p-6">
      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-gold" />
        <h2 className="font-display text-lg font-semibold">Crea tu mapa automáticamente</h2>
      </div>
      <p className="mb-5 text-sm text-muted">Sube una foto del recinto, ingresa medidas y sillas, y generamos una propuesta editable.</p>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        {/* Foto + medidas */}
        <div className="space-y-4">
          <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-surface/40 px-4 py-6 text-sm transition hover:border-fuchsia/50 ${uploaded ? "text-emerald-300" : "text-muted"}`}>
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : uploaded ? <Check className="h-5 w-5" /> : <ImageUp className="h-5 w-5" />}
            {uploading ? "Subiendo…" : uploaded ? "Foto del recinto cargada (de fondo)" : "Subir foto del recinto (JPG/PNG/WEBP)"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <div><div className="mb-1 text-xs text-muted">Ancho</div><input value={width} onChange={(e) => setWidth(e.target.value)} type="number" className={field} /></div>
            <div><div className="mb-1 text-xs text-muted">Largo</div><input value={length} onChange={(e) => setLength(e.target.value)} type="number" className={field} /></div>
            <div><div className="mb-1 text-xs text-muted">Unidad</div>
              <select value={unit} onChange={(e) => setUnit(e.target.value as "m" | "ft")} className={field}><option value="m">metros</option><option value="ft">pies</option></select>
            </div>
          </div>
        </div>

        {/* Sillas + pasillos */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><div className="mb-1 text-xs text-muted">Sillas totales</div><input value={chairs} onChange={(e) => setChairs(e.target.value)} type="number" className={field} /></div>
            <div><div className="mb-1 text-xs text-muted">Sillas por fila</div><input value={perRow} onChange={(e) => setPerRow(e.target.value)} type="number" className={field} /></div>
            <div><div className="mb-1 text-xs text-muted">Separación entre sillas ({unit})</div><input value={seatGap} onChange={(e) => setSeatGap(e.target.value)} type="number" step="0.05" className={field} /></div>
            <div><div className="mb-1 text-xs text-muted">Separación entre filas ({unit})</div><input value={rowGap} onChange={(e) => setRowGap(e.target.value)} type="number" step="0.05" className={field} /></div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <button onClick={() => setCentralAisle((v) => !v)} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${centralAisle ? "bg-fuchsia/15 text-fuchsia" : "border border-line text-muted"}`}>{centralAisle && <Check className="h-3.5 w-3.5" />} Pasillo central</button>
            <button onClick={() => setLateralAisles((v) => !v)} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${lateralAisles ? "bg-fuchsia/15 text-fuchsia" : "border border-line text-muted"}`}>{lateralAisles && <Check className="h-3.5 w-3.5" />} Pasillos laterales</button>
          </div>
        </div>
      </div>

      {err && <p className="mt-3 text-sm text-fuchsia">{err}</p>}

      <button onClick={generate} disabled={pending}
        className="brand-gradient mt-5 flex items-center gap-2 rounded-2xl px-6 py-3 font-semibold text-ink disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        {summary ? "Optimizar distribución" : "Generar mapa"}
      </button>

      {summary && (
        <div className="mt-5 rounded-2xl border border-line bg-surface/40 p-4">
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
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface/40 px-3 py-2 text-center">
      <div className="font-display text-xl font-bold">{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  );
}
