"use client";

import { useEffect, useRef, useState } from "react";
import type { Venue, VenueObject } from "@/lib/event-architect/types";
import { OBJ_COLOR } from "@/lib/event-architect/geometry";

interface Person { x: number; y: number; tx: number; ty: number; }

export function VenueCanvas({ venue, objects, selectedId, onSelect, onMove, simulating }: {
  venue: Venue; objects: VenueObject[]; selectedId: string | null;
  onSelect: (id: string | null) => void; onMove: (id: string, x: number, y: number) => void; simulating: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const W = venue.widthM, L = venue.lengthM;
  const dragRef = useRef<{ id: string; offX: number; offY: number } | null>(null);
  const [people, setPeople] = useState<Person[]>([]);

  // px↔m a partir del rect renderizado del SVG.
  function toMeters(clientX: number, clientY: number) {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * L };
  }
  function onDown(e: React.PointerEvent, o: VenueObject) {
    e.stopPropagation(); onSelect(o.id);
    const p = toMeters(e.clientX, e.clientY);
    dragRef.current = { id: o.id, offX: p.x - o.x, offY: p.y - o.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onMovePtr(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const p = toMeters(e.clientX, e.clientY);
    onMove(dragRef.current.id, p.x - dragRef.current.offX, p.y - dragRef.current.offY);
  }
  function onUp() { dragRef.current = null; }

  // Simulación: personas desde accesos hacia el bloque de sillas más cercano.
  useEffect(() => {
    if (!simulating) { setPeople([]); return; }
    const entrances = objects.filter((o) => o.type === "entrance");
    const targets = objects.filter((o) => o.type === "chairBlock" || o.type === "roundTable" || o.type === "vipArea");
    if (!entrances.length || !targets.length) return;
    const spawn = (): Person => {
      const en = entrances[Math.floor(Math.random() * entrances.length)];
      const tg = targets[Math.floor(Math.random() * targets.length)];
      return { x: en.x + en.width / 2, y: en.y, tx: tg.x + Math.random() * tg.width, ty: tg.y + Math.random() * tg.height };
    };
    setPeople(Array.from({ length: 70 }, spawn));
    let raf = 0;
    const tick = () => {
      setPeople((ps) => ps.map((p) => {
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        if (d < 0.4) return spawn();
        return { ...p, x: p.x + (dx / d) * 0.12, y: p.y + (dy / d) * 0.12 };
      }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [simulating, objects]);

  const seatDots = (o: VenueObject) => {
    const rows = (o.metadata?.rows as number) ?? 0, cols = (o.metadata?.cols as number) ?? 0;
    if (rows * cols === 0 || rows * cols > 1400) return null;
    const dots = [];
    const dx = o.width / Math.max(1, cols), dy = o.height / Math.max(1, rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) dots.push(<circle key={`${r}-${c}`} cx={o.x + dx * (c + 0.5)} cy={o.y + dy * (r + 0.5)} r={Math.min(dx, dy) * 0.28} fill={OBJ_COLOR.chairBlock} />);
    return <g>{dots}</g>;
  };

  return (
    <svg ref={svgRef} viewBox={`-0.5 -0.5 ${W + 1} ${L + 1}`} className="aspect-[4/3] w-full touch-none select-none rounded-2xl bg-[#0b0b12]"
      onPointerMove={onMovePtr} onPointerUp={onUp} onPointerLeave={onUp} onClick={() => onSelect(null)}>
      {/* Piso + muros + rejilla */}
      <rect x={0} y={0} width={W} height={L} fill="#0e0e16" stroke="#2a2a40" strokeWidth={0.15} />
      {Array.from({ length: Math.floor(W) }).map((_, i) => <line key={`v${i}`} x1={i + 1} y1={0} x2={i + 1} y2={L} stroke="#17172230" strokeWidth={0.03} />)}
      {Array.from({ length: Math.floor(L) }).map((_, i) => <line key={`h${i}`} x1={0} y1={i + 1} x2={W} y2={i + 1} stroke="#17172230" strokeWidth={0.03} />)}

      {objects.map((o) => {
        const color = (o.metadata?.color as string) || OBJ_COLOR[o.type];
        const sel = o.id === selectedId;
        const isSeat = o.type === "chairBlock";
        return (
          <g key={o.id} onPointerDown={(e) => onDown(e, o)} style={{ cursor: "move" }}>
            <rect x={o.x} y={o.y} width={o.width} height={o.height} rx={0.15}
              fill={color} fillOpacity={isSeat ? 0.1 : 0.45} stroke={sel ? "#fff" : color} strokeWidth={sel ? 0.12 : 0.06} />
            {isSeat && seatDots(o)}
            {o.width > 1.8 && o.height > 0.7 && <text x={o.x + o.width / 2} y={o.y + o.height / 2} fontSize={Math.min(0.7, o.height * 0.4)} fill="#f4f4f7" textAnchor="middle" dominantBaseline="middle" style={{ pointerEvents: "none" }}>{o.label}</text>}
          </g>
        );
      })}

      {people.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={0.18} fill="#fde047" opacity={0.9} />)}
    </svg>
  );
}
