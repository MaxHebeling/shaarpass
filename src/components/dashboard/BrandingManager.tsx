"use client";

import { useState, useRef, useTransition } from "react";
import { Loader2, Upload, Check, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { saveBranding } from "@/app/dashboard/actions";

export function BrandingManager(props: {
  orgId: string;
  initialLogo: string | null;
  initialColor: string | null;
  initialWhiteLabel: boolean;
}) {
  const [logoUrl, setLogoUrl] = useState(props.initialLogo);
  const [color, setColor] = useState(props.initialColor ?? "#D4AF37");
  const [whiteLabel, setWhiteLabel] = useState(props.initialWhiteLabel);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) { setErr("El logo debe pesar menos de 2 MB"); return; }
    setUploading(true); setErr(null);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${props.orgId}/logo-${Date.now()}.${ext}`;
      const db = createClient();
      const { error } = await db.storage.from("org-logos").upload(path, file, { upsert: true, cacheControl: "3600" });
      if (error) throw error;
      const { data } = db.storage.from("org-logos").getPublicUrl(path);
      setLogoUrl(data.publicUrl);
    } catch (e) { setErr((e as Error).message); } finally { setUploading(false); }
  }

  function save() {
    setMsg(null); setErr(null);
    start(async () => {
      const res = await saveBranding({ logoUrl, brandColor: color, whiteLabel });
      if (res?.error) setErr(res.error); else setMsg("✅ Marca guardada");
    });
  }

  return (
    <div className="glass rounded-3xl p-6">
      {/* Logo */}
      <h2 className="mb-1 font-display text-lg font-semibold">Tu logo</h2>
      <p className="mb-4 text-sm text-muted">Aparece en tus páginas de evento, boletos y correos. PNG/SVG con fondo transparente recomendado.</p>
      <div className="flex items-center gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-surface">
          {logoUrl
            ? <img src={logoUrl} alt="logo" className="h-full w-full object-contain p-2" />
            : <Sparkles className="h-6 w-6 text-muted" />}
        </div>
        <div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="glass flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition hover:border-white/20 disabled:opacity-50">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Subir logo
          </button>
          {logoUrl && <button onClick={() => setLogoUrl(null)} className="ml-3 text-xs text-muted hover:text-fuchsia">Quitar</button>}
        </div>
      </div>

      {/* Color */}
      <h2 className="mb-1 mt-7 font-display text-lg font-semibold">Color de marca</h2>
      <p className="mb-3 text-sm text-muted">El acento de tus botones y detalles.</p>
      <div className="flex items-center gap-3">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
          className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface" />
        <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#D4AF37"
          className="w-32 rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60" />
      </div>

      {/* White label */}
      <h2 className="mb-1 mt-7 font-display text-lg font-semibold">Modo exclusivo</h2>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={whiteLabel} onChange={(e) => setWhiteLabel(e.target.checked)}
          className="mt-1 h-4 w-4 accent-fuchsia" />
        <span className="text-sm text-muted">
          Oculta la marca ShaarPass en tus páginas, boletos y correos. Tu evento se ve 100% tuyo.
        </span>
      </label>

      {err && <p className="mt-4 text-sm text-fuchsia">{err}</p>}
      {msg && <p className="mt-4 text-sm text-emerald-400">{msg}</p>}
      <button onClick={save} disabled={pending || uploading}
        className="brand-gradient mt-5 flex items-center gap-2 rounded-2xl px-6 py-3 font-semibold text-ink disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar marca
      </button>
    </div>
  );
}
