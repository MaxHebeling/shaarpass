"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

export interface ActionResult { ok: boolean; error?: string; code?: string; [k: string]: unknown }

/** Ejecuta una acción del API de Protocolo y refresca los datos del servidor. */
export function useProtocolAction(eventId: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const run = useCallback(async (action: string, payload: Record<string, unknown> = {}, okText?: string): Promise<ActionResult> => {
    setBusy(true); setNotice(null);
    try {
      const r = await fetch(`/api/protocol/events/${eventId}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...payload }),
      });
      const data = (await r.json().catch(() => ({}))) as ActionResult;
      if (!r.ok) {
        setNotice({ tone: "error", text: data.error ?? "No se pudo completar la acción" });
        return { ...data, ok: false };
      }
      if (okText) setNotice({ tone: "ok", text: okText });
      router.refresh();
      return { ...data, ok: true };
    } catch {
      setNotice({ tone: "error", text: "Sin conexión. Intenta de nuevo." });
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }, [eventId, router]);

  return { run, busy, notice, setNotice };
}
