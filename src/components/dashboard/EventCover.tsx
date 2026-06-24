"use client";

import { useState, useRef, useTransition } from "react";
import { Loader2, ImagePlus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { setEventCover } from "@/app/dashboard/actions";

export function EventCover({ eventId, initial }: { eventId: string; initial: string | null }) {
  const [cover, setCover] = useState<string | null>(initial);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5_000_000) { setErr("La imagen debe pesar menos de 5 MB"); return; }
    setUploading(true); setErr(null);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${eventId}/cover-${Date.now()}.${ext}`;
      const db = createClient();
      const { error } = await db.storage.from("event-covers").upload(path, file, { upsert: true, cacheControl: "3600" });
      if (error) throw error;
      const { data } = db.storage.from("event-covers").getPublicUrl(path);
      const url = data.publicUrl;
      start(async () => {
        const res = await setEventCover(eventId, url);
        if (res?.error) setErr(res.error); else setCover(url);
      });
    } catch (e) { setErr((e as Error).message); } finally { setUploading(false); }
  }

  function removeCover() {
    start(async () => { const res = await setEventCover(eventId, null); if (!res?.error) setCover(null); });
  }

  return (
    <div className="glass rounded-3xl p-6">
      <h2 className="mb-1 font-display text-lg font-semibold">Imagen de portada</h2>
      <p className="mb-4 text-sm text-muted">Lo primero que ve tu público. Horizontal (16:9), mín. 1200×675 px. JPG o PNG, &lt; 5 MB.</p>

      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-line bg-surface">
        {cover
          ? <img src={cover} alt="portada" className="h-full w-full object-cover" />
          : <div className="grid h-full w-full place-items-center text-muted"><ImagePlus className="h-10 w-10" /></div>}
      </div>

      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
      <div className="mt-4 flex items-center gap-3">
        <button onClick={() => fileRef.current?.click()} disabled={uploading || pending}
          className="brand-gradient flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-50">
          {uploading || pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {cover ? "Cambiar imagen" : "Subir imagen"}
        </button>
        {cover && (
          <button onClick={removeCover} disabled={pending} className="flex items-center gap-1.5 text-sm text-muted transition hover:text-fuchsia disabled:opacity-50">
            <Trash2 className="h-4 w-4" /> Quitar
          </button>
        )}
      </div>
      {err && <p className="mt-3 text-sm text-fuchsia">{err}</p>}
    </div>
  );
}
