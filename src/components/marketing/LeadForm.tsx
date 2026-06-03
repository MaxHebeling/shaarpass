"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, Send } from "lucide-react";

export function LeadForm({ source, withMessage = true, cta = "Quiero que me contacten" }: { source: string; withMessage?: boolean; cta?: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/lead", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name || undefined, message: message || undefined, source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo enviar");
      setDone(true);
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }

  if (done) {
    return (
      <div className="glass ring-grad flex items-center gap-3 rounded-2xl p-5 text-sm">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-400" />
        <span>¡Listo! Recibimos tus datos y te contactamos muy pronto. Revisa tu correo.</span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Tu nombre (opcional)"
          className="rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm outline-none focus:border-fuchsia/60" />
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} placeholder="tu@correo.com"
          className="rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm outline-none focus:border-fuchsia/60" />
      </div>
      {withMessage && (
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={2} placeholder="¿Qué evento tienes en puerta? (opcional)"
          className="w-full rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm outline-none focus:border-fuchsia/60" />
      )}
      {error && <p className="text-sm text-fuchsia">{error}</p>}
      <button type="submit" disabled={loading}
        className="brand-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-ink transition hover:scale-[1.01] disabled:opacity-50 sm:w-auto sm:px-7">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {cta}
      </button>
    </form>
  );
}
