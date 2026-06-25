"use client";

import { useMemo, useRef, useState } from "react";
import { Box, Square, Download, Printer } from "lucide-react";
import type { EditorZone, EditorSeat } from "@/components/dashboard/MapEditor";

const ISO = Math.PI / 6; // 30°
const C = Math.cos(ISO), S = Math.sin(ISO);
const SCALE = 14; // px por metro al exportar

/** Visor read-only del mapa: 2D plano e isométrico (3D básico) + exportar PNG / imprimir. */
export function VenueViewer({ name, widthM, heightM, zones, seats }: {
  name: string; widthM: number; heightM: number; zones: EditorZone[]; seats: EditorSeat[];
}) {
  const [view, setView] = useState<"2d" | "3d">("2d");
  const svgRef = useRef<SVGSVGElement>(null);

  const seatColor = (zoneId: string) => zones.find((z) => z.id === zoneId)?.color ?? "#7c3aed";

  // --- 2D: viewBox en metros (y hacia abajo) ---
  const vb2d = `0 0 ${widthM} ${heightM}`;

  // --- 3D iso: proyecta y calcula límites ---
  const iso = (x: number, y: number, h = 0) => ({ x: (x - y) * C, y: (x + y) * S - h });
  const proj3d = useMemo(() => {
    const pts: { x: number; y: number }[] = [
      iso(0, 0), iso(widthM, 0), iso(widthM, heightM), iso(0, heightM),
      iso(0, 0, 1.6), iso(widthM, 0, 1.6), // techo del escenario aprox
    ];
    for (const z of zones) for (const [px, py] of z.points) pts.push(iso(px, py));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 1;
    return { minX: minX - pad, minY: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
  }, [widthM, heightM, zones]);
  const vb3d = `${proj3d.minX} ${proj3d.minY} ${proj3d.w} ${proj3d.h}`;

  const floor3d = [iso(0, 0), iso(widthM, 0), iso(widthM, heightM), iso(0, heightM)].map((p) => `${p.x},${p.y}`).join(" ");

  function exportPNG() {
    const svg = svgRef.current; if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const vb = (view === "2d" ? [0, 0, widthM, heightM] : [proj3d.minX, proj3d.minY, proj3d.w, proj3d.h]);
    const w = Math.round(vb[2] * SCALE), h = Math.round(vb[3] * SCALE);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d"); if (!ctx) return;
      ctx.fillStyle = "#08080c"; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const a = document.createElement("a"); a.href = cv.toDataURL("image/png"); a.download = `${name.replace(/\s+/g, "-")}-mapa.png`; a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
  }

  function printMap() {
    const svg = svgRef.current; if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>${name} — mapa</title><style>body{margin:0;background:#08080c;display:grid;place-items:center;height:100vh}svg{max-width:96vw;max-height:96vh}@media print{body{background:#fff}}</style></head><body>${xml}<script>window.onload=()=>{window.print()}</script></body></html>`);
    w.document.close();
  }

  return (
    <div className="glass mt-6 rounded-3xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Vista y exportar</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-line p-0.5 text-sm">
            <button onClick={() => setView("2d")} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${view === "2d" ? "brand-gradient text-ink" : "text-muted"}`}><Square className="h-3.5 w-3.5" /> 2D</button>
            <button onClick={() => setView("3d")} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${view === "3d" ? "brand-gradient text-ink" : "text-muted"}`}><Box className="h-3.5 w-3.5" /> 3D</button>
          </div>
          <button onClick={exportPNG} className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-sm transition hover:border-white/20"><Download className="h-4 w-4" /> PNG</button>
          <button onClick={printMap} className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-sm transition hover:border-white/20"><Printer className="h-4 w-4" /> PDF</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-[#0b0b12]">
        {view === "2d" ? (
          <svg ref={svgRef} viewBox={vb2d} className="h-[420px] w-full" preserveAspectRatio="xMidYMid meet">
            <rect x={0} y={0} width={widthM} height={heightM} fill="#0e0e16" stroke="#26263a" strokeWidth={0.1} />
            {zones.map((z) => (
              <g key={z.id}>
                <polygon points={z.points.map((p) => p.join(",")).join(" ")} fill={z.color} fillOpacity={z.kind === "seated" ? 0.12 : 0.3} stroke={z.color} strokeWidth={0.08} />
                {centroid(z.points) && <text x={centroid(z.points)!.x} y={centroid(z.points)!.y} fontSize={0.7} fill="#f4f4f7" textAnchor="middle" dominantBaseline="middle">{z.name}</text>}
              </g>
            ))}
            {seats.map((s) => <circle key={s.id} cx={s.x} cy={s.y} r={0.22} fill={seatColor(s.zoneId)} />)}
          </svg>
        ) : (
          <svg ref={svgRef} viewBox={vb3d} className="h-[420px] w-full" preserveAspectRatio="xMidYMid meet">
            <polygon points={floor3d} fill="#0e0e16" stroke="#2a2a40" strokeWidth={0.1} />
            {zones.map((z) => {
              const pts = z.points.map(([x, y]) => { const p = iso(x, y); return `${p.x},${p.y}`; }).join(" ");
              const c = centroid(z.points); const ci = c ? iso(c.x, c.y) : null;
              return (
                <g key={z.id}>
                  <polygon points={pts} fill={z.color} fillOpacity={z.kind === "seated" ? 0.18 : 0.45} stroke={z.color} strokeWidth={0.06} />
                  {ci && <text x={ci.x} y={ci.y} fontSize={0.6} fill="#f4f4f7" textAnchor="middle">{z.name}</text>}
                </g>
              );
            })}
            {seats.map((s) => { const p = iso(s.x, s.y); return <rect key={s.id} x={p.x - 0.18} y={p.y - 0.28} width={0.36} height={0.34} rx={0.08} fill={seatColor(s.zoneId)} />; })}
          </svg>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">El PNG/PDF exporta el mapa vectorial (sin la foto de fondo). El 3D es una representación isométrica básica.</p>
    </div>
  );
}

function centroid(points: [number, number][]): { x: number; y: number } | null {
  if (!points.length) return null;
  const x = points.reduce((s, p) => s + p[0], 0) / points.length;
  const y = points.reduce((s, p) => s + p[1], 0) / points.length;
  return { x, y };
}
