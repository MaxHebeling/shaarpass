"use client";

import { useState } from "react";
import {
  Sparkles, Wand2, Maximize2, Smile, Play, Save, Rocket, Loader2, Plus, Trash2,
  LayoutGrid, Gauge, Ticket, ScanLine, Wrench, ShieldAlert, MessageSquare, Send,
} from "lucide-react";
import type { GenerateInput, Layout, VenueObject, ObjType, Level } from "@/lib/event-architect/types";
import { generateLayout, parsePrompt } from "@/lib/event-architect/generator";
import { parseCommand } from "@/lib/event-architect/commandParser";
import { computeMetrics } from "@/lib/event-architect/metrics";
import { buildRecommendations } from "@/lib/event-architect/recommendations";
import { OBJ_LABEL, OBJ_SIZE, makeId, findFreeSpot, clampToVenue } from "@/lib/event-architect/geometry";
import { VenueCanvas } from "./VenueCanvas";

const TEMPLATES = ["Conferencia", "Congreso cristiano", "Iglesia", "Concierto", "Boda", "Banquete", "Expo", "Teatro", "Graduación", "Cena de gala"];
const LIBRARY: ObjType[] = ["stage", "chairBlock", "ledScreen", "registrationTable", "bookstore", "coffeeBreak", "vipArea", "techBooth", "streaming", "backstage", "bathroom", "entrance", "exit", "sponsorBooth", "securityPoint", "medicalPoint"];
const TABS = [{ k: "Diseño", icon: LayoutGrid }, { k: "Optimización", icon: Gauge }, { k: "Venta", icon: Ticket }, { k: "Check-In", icon: ScanLine }, { k: "Producción", icon: Wrench }, { k: "Seguridad", icon: ShieldAlert }];
const fld = "w-full rounded-lg border border-line bg-surface/60 px-2.5 py-2 text-sm outline-none focus:border-fuchsia/60";
const lvlColor: Record<Level, string> = { excelente: "text-emerald-400 bg-emerald-500/10", bueno: "text-sky-400 bg-sky-500/10", mejorable: "text-amber-400 bg-amber-500/10", critico: "text-rose-400 bg-rose-500/10" };

export function EventArchitect() {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [startMode, setStartMode] = useState<"prompt" | "measures" | "template">("prompt");
  const [prompt, setPrompt] = useState("");
  const [eventType, setEventType] = useState("Conferencia");
  const [width, setWidth] = useState("24"); const [length, setLength] = useState("36"); const [height, setHeight] = useState("6");
  const [capacity, setCapacity] = useState("500"); const [accesses, setAccesses] = useState("2"); const [exits, setExits] = useState("4");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chat, setChat] = useState(""); const [chatLog, setChatLog] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [tab, setTab] = useState("Diseño");
  const [simulating, setSimulating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  function recompute(objects: VenueObject[]) {
    setLayout((l) => l ? { ...l, objects, metrics: computeMetrics(l.venue, objects), recommendations: buildRecommendations(computeMetrics(l.venue, objects), objects) } : l);
  }

  function generate() {
    setBusy(true);
    const parsed = startMode === "prompt" ? parsePrompt(prompt) : ({} as ReturnType<typeof parsePrompt>);
    const input: GenerateInput = {
      eventType: parsed.eventType || eventType,
      widthM: Number(width) || 24, lengthM: Number(length) || 36, heightM: Number(height) || 6,
      targetCapacity: (parsed.targetCapacity as number) || Number(capacity) || 500,
      prompt: startMode === "prompt" ? prompt : undefined,
      accesses: Number(accesses) || 2, exits: Number(exits) || 4,
    };
    setTimeout(() => { setLayout(generateLayout(input)); setBusy(false); }, 350);
  }

  function applyCommand(text: string) {
    if (!layout) return;
    const res = parseCommand(text, layout.objects, layout.venue);
    recompute(res.objects);
    return res.message;
  }
  function sendChat() {
    const msg = chat.trim(); if (!msg || !layout) return;
    setChat(""); setChatLog((l) => [...l, { role: "user", text: msg }]);
    const m = applyCommand(msg);
    setChatLog((l) => [...l, { role: "ai", text: m || "Hecho." }]);
  }
  function addObject(type: ObjType) {
    if (!layout) return;
    const s = OBJ_SIZE[type];
    const base: VenueObject = { id: makeId(type), type, label: OBJ_LABEL[type], x: 1, y: 1, width: s.w, height: s.h, rotation: 0, capacityImpact: type === "chairBlock" ? 0 : 0, metadata: type === "chairBlock" ? { rows: 5, cols: 8 } : undefined };
    if (type === "chairBlock") { base.capacityImpact = 40; base.width = 8 * 0.55; base.height = 5 * 0.9; }
    recompute([...layout.objects, findFreeSpot(base, layout.venue, layout.objects)]);
  }
  function removeSelected() { if (layout && selectedId) { recompute(layout.objects.filter((o) => o.id !== selectedId)); setSelectedId(null); } }
  function moveObject(id: string, x: number, y: number) {
    if (!layout) return;
    recompute(layout.objects.map((o) => o.id === id ? clampToVenue({ ...o, x, y }, layout.venue) : o));
  }
  function optimize() {
    if (!layout) return; let objs = [...layout.objects]; const m = layout.metrics;
    if (m.exits < 2) objs.push(findFreeSpot({ id: makeId("exit"), type: "exit", label: OBJ_LABEL.exit, x: 0, y: layout.venue.lengthM / 2, width: OBJ_SIZE.exit.w, height: OBJ_SIZE.exit.h, rotation: 0, capacityImpact: 0 }, layout.venue, objs));
    if (m.capacity > 1000 && m.accesses < 3) objs.push(findFreeSpot({ id: makeId("entrance"), type: "entrance", label: OBJ_LABEL.entrance, x: 0, y: layout.venue.lengthM - 0.5, width: OBJ_SIZE.entrance.w, height: OBJ_SIZE.entrance.h, rotation: 0, capacityImpact: 0 }, layout.venue, objs));
    recompute(objs);
    setChatLog((l) => [...l, { role: "ai", text: "Optimicé: balanceé salidas/accesos para mejor evacuación y circulación." }]);
  }
  function saveProject(publish = false) {
    if (!layout) return; setBusy(true);
    try { localStorage.setItem("architect:project", JSON.stringify(layout)); } catch { /* noop */ }
    setSaved(publish ? "Mapa publicado (demo)." : "Proyecto guardado."); setTimeout(() => { setBusy(false); setSaved(null); }, 1800);
  }

  const m = layout?.metrics;

  // ---------- INICIO ----------
  if (!layout) {
    return (
      <div className="glass ring-grad rounded-3xl p-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="font-display text-2xl font-bold">Arquitecto IA de Eventos</h1>
          <p className="mt-2 text-sm text-muted">Describe tu evento, ingresa medidas o elige una plantilla — la IA genera un espacio completo, medible y optimizado.</p>
          <div className="mx-auto mt-5 flex w-fit rounded-full border border-line p-0.5 text-sm">
            {(["prompt", "measures", "template"] as const).map((mo) => <button key={mo} onClick={() => setStartMode(mo)} className={`rounded-full px-4 py-1.5 transition ${startMode === mo ? "brand-gradient text-ink" : "text-muted"}`}>{mo === "prompt" ? "Describir" : mo === "measures" ? "Medidas" : "Plantilla"}</button>)}
          </div>

          {startMode === "prompt" && (
            <div className="mt-5 text-left">
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} className={fld} placeholder="Describe el evento que quieres construir… Ej: Congreso cristiano para 2,500 personas, escenario de 18 m, dos pantallas LED, librería, coffee break, 8 mesas de registro, zona VIP para 150 y cabina de streaming." />
              <div className="mt-2 grid grid-cols-3 gap-2">
                <L label="Ancho (m)"><input value={width} onChange={(e) => setWidth(e.target.value)} type="number" className={fld} /></L>
                <L label="Largo (m)"><input value={length} onChange={(e) => setLength(e.target.value)} type="number" className={fld} /></L>
                <L label="Altura (m)"><input value={height} onChange={(e) => setHeight(e.target.value)} type="number" className={fld} /></L>
              </div>
            </div>
          )}
          {startMode === "measures" && (
            <div className="mt-5 grid grid-cols-2 gap-2 text-left sm:grid-cols-3">
              <L label="Tipo"><select value={eventType} onChange={(e) => setEventType(e.target.value)} className={fld}>{TEMPLATES.map((t) => <option key={t}>{t}</option>)}</select></L>
              <L label="Ancho (m)"><input value={width} onChange={(e) => setWidth(e.target.value)} type="number" className={fld} /></L>
              <L label="Largo (m)"><input value={length} onChange={(e) => setLength(e.target.value)} type="number" className={fld} /></L>
              <L label="Altura (m)"><input value={height} onChange={(e) => setHeight(e.target.value)} type="number" className={fld} /></L>
              <L label="Capacidad"><input value={capacity} onChange={(e) => setCapacity(e.target.value)} type="number" className={fld} /></L>
              <L label="Accesos"><input value={accesses} onChange={(e) => setAccesses(e.target.value)} type="number" className={fld} /></L>
              <L label="Salidas"><input value={exits} onChange={(e) => setExits(e.target.value)} type="number" className={fld} /></L>
            </div>
          )}
          {startMode === "template" && (
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TEMPLATES.map((t) => <button key={t} onClick={() => { setEventType(t); }} className={`rounded-xl border px-3 py-3 text-sm transition ${eventType === t ? "border-fuchsia bg-fuchsia/10 text-fg" : "border-line text-muted hover:border-white/20"}`}>{t}</button>)}
            </div>
          )}

          <button onClick={generate} disabled={busy} className="brand-gradient mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-3 font-semibold text-ink disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {startMode === "template" ? "Construir recinto" : startMode === "measures" ? "Construir recinto" : "Generar Espacio"}
          </button>
        </div>
      </div>
    );
  }

  // ---------- ESTUDIO ----------
  return (
    <div className="space-y-3">
      {/* Barra superior */}
      <div className="glass flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {TABS.map((tt) => <button key={tt.k} onClick={() => setTab(tt.k)} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition ${tab === tt.k ? "brand-gradient text-ink" : "text-muted hover:text-fg"}`}><tt.icon className="h-3.5 w-3.5" /> {tt.k}</button>)}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Btn onClick={() => setLayout(null)} icon={Wand2}>Nuevo</Btn>
          <Btn onClick={optimize} icon={Gauge}>Optimizar IA</Btn>
          <Btn onClick={() => { const msg = applyCommand("maximiza capacidad"); setChatLog((l) => [...l, { role: "ai", text: msg || "" }]); }} icon={Maximize2}>Maximizar</Btn>
          <Btn onClick={() => { const msg = applyCommand("comodidad"); setChatLog((l) => [...l, { role: "ai", text: msg || "" }]); }} icon={Smile}>Comodidad</Btn>
          <Btn onClick={() => setSimulating((s) => !s)} icon={Play} active={simulating}>Simular</Btn>
          <Btn onClick={() => saveProject(false)} icon={Save}>Guardar</Btn>
          <button onClick={() => saveProject(true)} className="brand-gradient flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-ink">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />} Publicar</button>
        </div>
      </div>
      {saved && <p className="text-center text-sm text-emerald-400">{saved}</p>}

      <div className="grid gap-3 xl:grid-cols-[170px_1fr_300px]">
        {/* Biblioteca de objetos */}
        <div className="glass rounded-2xl p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Objetos</div>
          <div className="flex flex-col gap-1.5">
            {LIBRARY.map((tp) => <button key={tp} onClick={() => addObject(tp)} className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-left text-[11px] transition hover:border-fuchsia/50"><Plus className="h-3 w-3" /> {OBJ_LABEL[tp]}</button>)}
          </div>
          {selectedId && <button onClick={removeSelected} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 px-2 py-1.5 text-[11px] text-rose-400"><Trash2 className="h-3 w-3" /> Eliminar selección</button>}
        </div>

        {/* Canvas */}
        <div className="min-w-0">
          <VenueCanvas venue={layout.venue} objects={layout.objects} selectedId={selectedId} onSelect={setSelectedId} onMove={moveObject} simulating={simulating} />
          <p className="mt-1.5 text-center text-[11px] text-muted">{layout.venue.eventType} · {layout.venue.widthM}×{layout.venue.lengthM} m · arrastra los elementos para reubicarlos</p>
        </div>

        {/* Panel derecho según tab */}
        <div className="space-y-3">
          {tab === "Diseño" || tab === "Optimización" ? (
            <>
              <Panel title="Métricas en vivo">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <Row k="Capacidad" v={m!.capacity} /><Row k="Recomendada" v={m!.recommended} />
                  <Row k="Sillas" v={m!.chairs} /><Row k="Mesas" v={m!.tables} />
                  <Row k="Área total" v={`${m!.areaTotal} m²`} /><Row k="Ocupada" v={`${m!.areaOccupied} m²`} />
                  <Row k="Libre" v={`${m!.areaFree} m²`} /><Row k="% ocupado" v={`${m!.pctOccupied}%`} />
                  <Row k="Accesos" v={m!.accesses} /><Row k="Salidas" v={m!.exits} />
                  <Row k="Ingreso" v={`${m!.ingressMin} min`} /><Row k="Evacuación" v={`${m!.evacMin} min`} />
                </div>
                <div className="mt-2 space-y-1.5">
                  <Bar label="Visibilidad" v={m!.visibility} /><Bar label="Comodidad" v={m!.comfort} /><Bar label="Circulación" v={m!.circulation} />
                </div>
              </Panel>
              <Panel title="Recomendaciones IA">
                <div className="space-y-1.5">
                  {layout.recommendations.map((r) => (
                    <div key={r.id} className="rounded-lg border border-line bg-surface/40 p-2">
                      <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">{r.title}</span><span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${lvlColor[r.level]}`}>{r.level}</span></div>
                      <p className="mt-0.5 text-[11px] text-muted">{r.detail}</p>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title={<><MessageSquare className="inline h-3.5 w-3.5" /> Editar con IA</>}>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {chatLog.length === 0 && <p className="text-[11px] text-muted">“agrega una librería”, “4 mesas de registro”, “zona VIP para 100”, “escenario al fondo”, “pasillo central más ancho”.</p>}
                  {chatLog.map((c, i) => <div key={i} className={`rounded px-2 py-1 text-[11px] ${c.role === "user" ? "bg-fuchsia/10 text-fg" : "bg-surface/60 text-muted"}`}>{c.text}</div>)}
                </div>
                <div className="mt-2 flex gap-1.5">
                  <input value={chat} onChange={(e) => setChat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat()} placeholder="Escribe un comando…" className={fld} />
                  <button onClick={sendChat} className="brand-gradient shrink-0 rounded-lg px-2.5 text-ink"><Send className="h-4 w-4" /></button>
                </div>
              </Panel>
            </>
          ) : (
            <Panel title={tab}>
              <p className="text-xs text-muted">
                {tab === "Venta" && "Publica el mapa para habilitar la venta de boletos con selección de asientos desde esta distribución."}
                {tab === "Check-In" && `Aforo objetivo ${m!.capacity}. Al publicar, este mapa alimentará el control de acceso y check-in con QR.`}
                {tab === "Producción" && "Zonas técnicas: escenario, backstage, cabina y streaming quedan listadas para el equipo de producción."}
                {tab === "Seguridad" && `Salidas: ${m!.exits} · evacuación estimada ${m!.evacMin} min. Revisa rutas y puntos de seguridad.`}
              </p>
              <p className="mt-2 text-[11px] text-muted/60">Vista estructurada para expansión en próximas versiones.</p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) { return <div><div className="mb-1 text-[11px] text-muted">{label}</div>{children}</div>; }
function Panel({ title, children }: { title: React.ReactNode; children: React.ReactNode }) { return <div className="glass rounded-2xl p-3.5"><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>{children}</div>; }
function Row({ k, v }: { k: string; v: string | number }) { return <div className="flex items-center justify-between"><span className="text-muted">{k}</span><span className="font-display font-bold tabular-nums text-fg">{v}</span></div>; }
function Bar({ label, v }: { label: string; v: number }) { return <div><div className="mb-0.5 flex justify-between text-[10px] text-muted"><span>{label}</span><span>{v}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="brand-gradient h-full rounded-full" style={{ width: `${v}%` }} /></div></div>; }
function Btn({ onClick, icon: Icon, children, active }: { onClick: () => void; icon: typeof Gauge; children: React.ReactNode; active?: boolean }) {
  return <button onClick={onClick} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${active ? "border-fuchsia/60 text-fuchsia" : "border-line text-muted hover:text-fg"}`}><Icon className="h-3.5 w-3.5" /> {children}</button>;
}
