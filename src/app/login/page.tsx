"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

function LoginInner() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const next = useSearchParams().get("next") || "/dashboard";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const db = createClient();
    if (mode === "in") {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message);
      else router.push(next);
    } else {
      const { data, error } = await db.auth.signUp({ email, password });
      if (error) setMsg(error.message);
      else if (data.session) router.push(next);
      else setMsg("Revisa tu correo para confirmar la cuenta y luego inicia sesión.");
    }
    setLoading(false);
  }

  return (
    <main className="aurora relative grid min-h-screen place-items-center px-6">
      <div className="glass relative z-10 w-full max-w-sm rounded-3xl p-8">
        <div className="mb-6 flex flex-col items-center gap-3">
          <img src="/logo-mark.png" alt="ShaarPass" className="h-20 w-20 rounded-2xl shadow-lg shadow-fuchsia/20" />
          <span className="font-display text-2xl font-bold tracking-tight">ShaarPass</span>
        </div>
        <h1 className="font-display text-2xl font-bold">
          {mode === "in" ? "Bienvenido de vuelta" : "Crea tu cuenta"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "in" ? "Entra a tu panel de organizador." : "Empieza a vender boletos en minutos."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="email" required placeholder="tu@correo.com" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm outline-none transition focus:border-fuchsia/60"
          />
          <input
            type="password" required placeholder="Contraseña" value={password}
            onChange={(e) => setPassword(e.target.value)} minLength={6}
            className="w-full rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm outline-none transition focus:border-fuchsia/60"
          />
          {msg && <p className="text-sm text-fuchsia">{msg}</p>}
          <button
            type="submit" disabled={loading}
            className="brand-gradient flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold text-ink transition hover:scale-[1.01] disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "in" ? "Entrar" : "Crear cuenta"}
          </button>
          {mode === "up" && (
            <p className="text-center text-[11px] leading-relaxed text-muted">
              Al crear tu cuenta aceptas los{" "}
              <a href="/terminos" target="_blank" className="text-fg underline">Términos</a> y la{" "}
              <a href="/privacidad" target="_blank" className="text-fg underline">Política de Privacidad</a>.
            </p>
          )}
        </form>

        <button
          onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }}
          className="mt-5 w-full text-center text-sm text-muted transition hover:text-fg"
        >
          {mode === "in" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Entra"}
        </button>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
