"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Zap, Loader2, Check } from "lucide-react";
import { AUTOMATIONS, automationScheduledAt } from "@/lib/email/automations";
import { toggleAutomation } from "@/app/dashboard/actions";

export interface AutoState { scheduledAt: string | null; status: string; }

export function AutomationsPanel({ eventId, startsAt, endsAt, enabled }: {
  eventId: string; startsAt: string; endsAt: string; enabled: Record<string, AutoState>;
}) {
  const [state, setState] = useState(enabled);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function fmt(iso: string) {
    return new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function flip(key: string, on: boolean) {
    setErr(null); setBusy(key);
    start(async () => {
      const res = await toggleAutomation({ eventId, key, enabled: on });
      setBusy(null);
      if ("error" in res && res.error) { setErr(`${key}: ${res.error}`); return; }
      setState((s) => {
        const next = { ...s };
        if (on) next[key] = { scheduledAt: ("scheduledAt" in res && res.scheduledAt) || null, status: "scheduled" };
        else delete next[key];
        return next;
      });
      router.refresh();
    });
  }

  return (
    <div className="glass rounded-3xl p-6">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold"><Zap className="h-5 w-5 text-gold" /> Automatizaciones</h2>
      <p className="mb-4 text-sm text-muted">Correos que se envían solos en función de la fecha del evento. Actívalos y olvídate.</p>
      {err && <p className="mb-3 text-sm text-fuchsia">{err}</p>}
      <div className="space-y-2">
        {AUTOMATIONS.map((a) => {
          const on = !!state[a.key];
          const isRegister = !!a.onRegister;
          const computed = isRegister ? null : automationScheduledAt(a, startsAt, endsAt);
          const isPast = !isRegister && computed !== null && new Date(computed).getTime() <= Date.now();
          const st = state[a.key];
          return (
            <div key={a.key} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/40 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{a.label}</div>
                <div className="text-xs text-muted">
                  {a.description}
                  {isRegister ? <span className={on ? "text-gold" : "text-muted/60"}> · {on ? "activa · se envía al registrarse" : "se envía al registrarse"}</span>
                    : on && st?.scheduledAt ? <span className="text-gold"> · {st.status === "sent" ? "enviada" : `programada ${fmt(st.scheduledAt)}`}</span>
                    : isPast ? <span className="text-muted/60"> · esa fecha ya pasó</span>
                    : <span className="text-muted/60"> · se enviaría {computed ? fmt(computed) : ""}</span>}
                </div>
              </div>
              <button
                onClick={() => flip(a.key, !on)}
                disabled={busy === a.key || pending || (!on && isPast)}
                className={`flex h-7 w-12 shrink-0 items-center rounded-full px-0.5 transition disabled:opacity-40 ${on ? "bg-emerald-500/80" : "bg-surface-2"}`}
                aria-label={on ? "Desactivar" : "Activar"}
              >
                {busy === a.key ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> :
                  <span className={`grid h-6 w-6 place-items-center rounded-full bg-white transition-transform ${on ? "translate-x-5" : ""}`}>
                    {on && <Check className="h-3 w-3 text-emerald-600" />}
                  </span>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
