"use client";

import { useCallback, useEffect, useRef } from "react";

export interface CanvasSeat { id: string; x: number; y: number; status: string; label: string; }

/**
 * Renderizador de asientos en Canvas 2D con culling de viewport + pan/zoom.
 * Maneja decenas de miles de asientos a 60fps (donde el SVG colapsa).
 * Para >100k por zona, el siguiente paso es WebGL (PixiJS) — drop-in sobre esta API.
 */
export function CanvasSeatLayer({
  seats, baseColor, selected, onToggle,
}: { seats: CanvasSeat[]; baseColor: string; selected: Set<string>; onToggle: (id: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef({ scale: 1, ox: 0, oy: 0, userMoved: false });
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const bounds = useRef({ minX: 0, minY: 0, w: 1, h: 1 });
  useEffect(() => {
    if (!seats.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of seats) { minX = Math.min(minX, s.x); minY = Math.min(minY, s.y); maxX = Math.max(maxX, s.x); maxY = Math.max(maxY, s.y); }
    bounds.current = { minX: minX - 1, minY: minY - 1, w: maxX - minX + 2, h: maxY - minY + 2 };
    view.current.userMoved = false;
  }, [seats]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    if (canvas.width !== cssW * dpr) { canvas.width = cssW * dpr; canvas.height = cssH * dpr; }
    if (cssW < 2 || cssH < 2) return; // aún sin layout
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // Auto-fit: encuadra la zona al canvas mientras el usuario no haya hecho zoom/pan.
    const b = bounds.current;
    if (!view.current.userMoved) {
      const s = Math.min(cssW / b.w, cssH / b.h) * 0.92;
      view.current.scale = s;
      view.current.ox = (cssW - b.w * s) / 2 - b.minX * s;
      view.current.oy = (cssH - b.h * s) / 2 - b.minY * s;
    }
    const { scale, ox, oy } = view.current;
    const r = Math.max(1.5, scale * 0.32);

    // Culling: solo dibuja lo visible.
    const vx0 = -ox / scale, vy0 = -oy / scale, vx1 = (cssW - ox) / scale, vy1 = (cssH - oy) / scale;
    for (const s of seats) {
      if (s.x < vx0 || s.x > vx1 || s.y < vy0 || s.y > vy1) continue;
      const px = s.x * scale + ox, py = s.y * scale + oy;
      ctx.fillStyle = s.status !== "available" ? "#3a3a4a" : selected.has(s.id) ? "#f5c451" : baseColor;
      ctx.beginPath(); ctx.arc(px, py, r, 0, 6.2832); ctx.fill();
    }
  }, [seats, selected, baseColor]);

  useEffect(() => {
    // rAF asegura que el canvas ya tenga dimensiones antes del fit.
    const id = requestAnimationFrame(() => draw());
    return () => cancelAnimationFrame(id);
  }, [draw]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  function toWorld(e: React.PointerEvent | React.MouseEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { scale, ox, oy } = view.current;
    return { x: (e.clientX - rect.left - ox) / scale, y: (e.clientY - rect.top - oy) / scale };
  }

  function onWheel(e: React.WheelEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const v = view.current;
    v.userMoved = true;
    const wx = (mx - v.ox) / v.scale, wy = (my - v.oy) / v.scale;
    v.scale = Math.max(0.2, Math.min(40, v.scale * factor));
    v.ox = mx - wx * v.scale; v.oy = my - wy * v.scale;
    draw();
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ height: 420 }}
      className="w-full touch-none rounded-2xl bg-ink-2"
      onWheel={onWheel}
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, moved: false }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) { drag.current.moved = true; view.current.userMoved = true; }
        view.current.ox += dx; view.current.oy += dy;
        drag.current.x = e.clientX; drag.current.y = e.clientY;
        draw();
      }}
      onPointerUp={(e) => {
        const wasDrag = drag.current?.moved;
        drag.current = null;
        if (wasDrag) return;
        // Click: selecciona el asiento más cercano disponible.
        const { x, y } = toWorld(e);
        let best: CanvasSeat | null = null, bd = Infinity;
        for (const s of seats) {
          if (s.status !== "available") continue;
          const d = (s.x - x) ** 2 + (s.y - y) ** 2;
          if (d < bd) { bd = d; best = s; }
        }
        const tol = (1.2 / view.current.scale) ** 2 + 1;
        if (best && bd < tol) onToggle(best.id);
      }}
    />
  );
}
