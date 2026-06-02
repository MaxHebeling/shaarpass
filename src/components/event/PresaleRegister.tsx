"use client";

import { useState } from "react";
import { Star, Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

export function PresaleRegister({ eventId }: { eventId: string }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await createClient().rpc("register_presale", { p_event: eventId, p_email: email });
    setLoading(false);
    if (!error) setDone(true);
  }

  if (done) {
    return (
      <div className="glass mt-5 flex items-center gap-2 rounded-2xl border border-gold/30 p-4 text-sm text-emerald-300">
        <Check className="h-4 w-4" /> ¡Registrado! Si te seleccionan, te enviaremos tu código de acceso anticipado.
      </div>
    );
  }

  return (
    <form onSubmit={register} className="glass mt-5 rounded-2xl border border-gold/30 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gold">
        <Star className="h-4 w-4" /> Acceso anticipado (Verified Fan)
      </div>
      <p className="mb-3 text-xs text-muted">Regístrate para entrar al sorteo de compra anticipada antes de la venta general.</p>
      <div className="flex gap-2">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com"
          className="flex-1 rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60" />
        <button disabled={loading} className="brand-gradient rounded-xl px-4 text-sm font-semibold text-ink disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrarme"}
        </button>
      </div>
    </form>
  );
}
