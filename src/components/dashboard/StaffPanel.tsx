"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2, Copy, Check, MessageCircle, Mail, Ban, RotateCcw, Trash2, DoorOpen } from "lucide-react";
import { addCheckinStaff, revokeCheckinStaff, removeCheckinStaff } from "@/app/dashboard/actions";

export interface StaffRow {
  id: string; name: string; gate: string | null; role: string; token: string;
  revoked: boolean; scans_count: number; last_active_at: string | null;
}

export function StaffPanel({ eventId, eventTitle, initial }: { eventId: string; eventTitle: string; initial: StaffRow[] }) {
  const [staff, setStaff] = useState(initial);
  const [name, setName] = useState("");
  const [gate, setGate] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const linkFor = (token: string) => (typeof window !== "undefined" ? `${window.location.origin}/checkin/${token}` : `/checkin/${token}`);

  function add() {
    setErr(null);
    start(async () => {
      const res = await addCheckinStaff({ eventId, name, gate });
      if (res?.error) { setErr(res.error); return; }
      if (res?.id && res.token) setStaff((s) => [...s, { id: res.id, name: name.trim(), gate: gate.trim() || null, role: "checkin", token: res.token, revoked: false, scans_count: 0, last_active_at: null }]);
      setName(""); setGate("");
    });
  }

  return (
    <div className="glass rounded-3xl p-6">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="font-display text-lg font-semibold">Equipo de Recepción</h2>
      </div>
      <p className="mb-4 text-sm text-muted">Agrega escáneres y envíales un enlace seguro. Entran sin descargar app ni compartir tu cuenta.</p>

      {/* Agregar escáner */}
      <div className="rounded-2xl border border-line bg-surface/40 p-3">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej. Ana)"
            className="rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60" />
          <input value={gate} onChange={(e) => setGate(e.target.value)} placeholder="Puerta (opcional)"
            className="rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60" />
          <button onClick={add} disabled={pending || !name.trim()}
            className="brand-gradient flex items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-ink disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Agregar Escáner
          </button>
        </div>
        {err && <p className="mt-2 text-sm text-fuchsia">{err}</p>}
      </div>

      {/* Lista de staff */}
      <div className="mt-4 space-y-2.5">
        {staff.length === 0 && <p className="text-sm text-muted">Aún no agregas personal de recepción.</p>}
        {staff.map((s) => (
          <StaffCard key={s.id} eventId={eventId} eventTitle={eventTitle} s={s} link={linkFor(s.token)}
            onChange={(next) => setStaff((arr) => arr.map((x) => (x.id === s.id ? { ...x, ...next } : x)))}
            onRemove={() => { setStaff((arr) => arr.filter((x) => x.id !== s.id)); router.refresh(); }} />
        ))}
      </div>
    </div>
  );
}

function StaffCard({ eventId, eventTitle, s, link, onChange, onRemove }: {
  eventId: string; eventTitle: string; s: StaffRow; link: string;
  onChange: (next: Partial<StaffRow>) => void; onRemove: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, start] = useTransition();
  const waText = encodeURIComponent(`Hola ${s.name}, este es tu enlace de check-in para "${eventTitle}"${s.gate ? ` (${s.gate})` : ""}: ${link}`);
  const lastActive = s.last_active_at ? new Date(s.last_active_at).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Sin actividad";

  async function copy() { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ } }

  return (
    <div className={`rounded-2xl border border-line bg-surface/40 p-3.5 ${s.revoked ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{s.name}</span>
            {s.gate && <span className="flex items-center gap-1 rounded-full bg-fuchsia/10 px-2 py-0.5 text-[11px] text-fuchsia"><DoorOpen className="h-3 w-3" /> {s.gate}</span>}
            {s.revoked && <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-400">Revocado</span>}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">{s.scans_count} escaneos · {lastActive}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={copy} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs transition hover:border-white/20">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copiado" : "Copiar enlace"}
        </button>
        <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs transition hover:border-white/20">
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </a>
        <a href={`mailto:?subject=${encodeURIComponent("Tu enlace de check-in")}&body=${waText}`} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs transition hover:border-white/20">
          <Mail className="h-3.5 w-3.5" /> Correo
        </a>
        <button onClick={() => start(async () => { await revokeCheckinStaff({ staffId: s.id, eventId, revoked: !s.revoked }); onChange({ revoked: !s.revoked }); })}
          disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs transition hover:border-white/20 disabled:opacity-50">
          {s.revoked ? <><RotateCcw className="h-3.5 w-3.5" /> Reactivar</> : <><Ban className="h-3.5 w-3.5" /> Revocar</>}
        </button>
        <button onClick={() => { if (confirm(`¿Eliminar a ${s.name}?`)) start(async () => { await removeCheckinStaff({ staffId: s.id, eventId }); onRemove(); }); }}
          disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-rose-400 transition hover:border-rose-500/40 disabled:opacity-50">
          <Trash2 className="h-3.5 w-3.5" /> Eliminar
        </button>
      </div>
    </div>
  );
}
