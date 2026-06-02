"use client";

import { useState } from "react";
import { Loader2, Wallet } from "lucide-react";

/** Inicia el onboarding de cobro del vendedor. Sirve al listar (token) o tras la
 *  venta (claimToken). */
export function SellerPayoutButton({ token, claimToken, label = "Conectar cuenta para cobrar" }: { token?: string; claimToken?: string; label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/seller/onboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token ? { token } : { claimToken }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "No se pudo iniciar. ¿Stripe configurado?");
      window.location.href = data.url;
    } catch (e) { setError((e as Error).message); setLoading(false); }
  }

  return (
    <div>
      <button onClick={go} disabled={loading}
        className="brand-gradient mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-ink disabled:opacity-50">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} {label}
      </button>
      {error && <p className="mt-2 text-sm text-fuchsia">{error}</p>}
    </div>
  );
}
