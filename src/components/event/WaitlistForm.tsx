"use client";

import { useState } from "react";
import { BellRing, Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

export function WaitlistForm({ eventId }: { eventId: string }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const { error } = await createClient().from("waitlist").insert({ event_id: eventId, email: email.trim() });
    setLoading(false);
    if (error) setError("No se pudo registrar. Intenta de nuevo.");
    else setDone(true);
  }

  if (done) {
    return (
      <div className="glass mt-5 flex items-center gap-2 rounded-2xl p-4 text-sm text-emerald-300">
        <Check className="h-4 w-4" /> ¡Listo! Te avisaremos si se libera un lugar.
      </div>
    );
  }

  return (
    <form onSubmit={join} className="glass mt-5 rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <BellRing className="h-4 w-4 text-gold" /> Lista de espera
      </div>
      <p className="mb-3 text-xs text-muted">¿Agotado o no encuentras lugar? Te avisamos si se libera uno.</p>
      <div className="flex gap-2">
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com"
          className="flex-1 rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60"
        />
        <button disabled={loading} className="brand-gradient flex items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-ink disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Avísame
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-fuchsia">{error}</p>}
    </form>
  );
}
