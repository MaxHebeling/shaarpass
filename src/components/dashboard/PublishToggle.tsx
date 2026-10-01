"use client";

import { useState, useTransition } from "react";
import { Loader2, Globe, EyeOff } from "lucide-react";
import { setEventStatus } from "@/app/dashboard/actions";

export function PublishToggle({ eventId, status }: { eventId: string; status: string }) {
  const published = status === "published";
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function toggle() {
    const publish = !published;
    const msg = publish
      ? "¿Publicar el evento? Quedará visible y a la venta."
      : "¿Despublicar el evento? Dejará de estar visible y no se podrán comprar boletos.";
    if (!window.confirm(msg)) return;
    setErr(null);
    start(async () => {
      const res = await setEventStatus({ eventId, publish });
      if (res?.error) setErr(res.error);
      // En éxito, revalidatePath refresca el estado del server component.
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggle}
        disabled={pending}
        className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${published ? "glass text-fg hover:border-white/20" : "brand-gradient text-ink"}`}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : published ? <EyeOff className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
        {published ? "Despublicar" : "Publicar"}
      </button>
      {err && <p className="max-w-[260px] text-right text-[11px] leading-snug text-fuchsia">{err}</p>}
    </div>
  );
}
