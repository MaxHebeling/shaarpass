"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Send, Loader2, BellRing } from "lucide-react";
import { sendCampaign } from "@/app/dashboard/actions";

export function CampaignComposer({ eventId, buyers, waitlistCount }: { eventId: string; buyers: number; waitlistCount: number }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function send() {
    setMsg(null);
    start(async () => {
      const res = await sendCampaign(eventId, subject, body);
      if (res?.error) { setMsg(res.error); return; }
      if (res?.reason === "no_key") setMsg(`Listo, pero falta configurar Resend (0 enviados de ${res.total}).`);
      else setMsg(`✅ Enviado a ${res?.sent} de ${res?.total} compradores.`);
      setSubject(""); setBody("");
      router.refresh();
    });
  }

  return (
    <div className="glass rounded-3xl p-6">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
        <Mail className="h-5 w-5 text-gold" /> Email a compradores
      </h2>
      <p className="mb-4 text-sm text-muted">
        Envía un anuncio o recordatorio a tus <strong className="text-fg">{buyers}</strong> compradores.
        {waitlistCount > 0 && <span className="ml-1 inline-flex items-center gap-1 text-gold"><BellRing className="h-3.5 w-3.5" /> {waitlistCount} en lista de espera</span>}
      </p>
      <div className="space-y-2">
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto"
          className="w-full rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Tu mensaje…"
          className="w-full rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60" />
      </div>
      <button onClick={send} disabled={pending || buyers === 0 || !subject.trim() || !body.trim()}
        className="brand-gradient mt-3 flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar a {buyers} compradores
      </button>
      {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
    </div>
  );
}
