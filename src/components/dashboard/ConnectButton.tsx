"use client";

import { useState } from "react";
import { Loader2, CreditCard } from "lucide-react";

export function ConnectButton({ label }: { label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/connect/onboard", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "No se pudo iniciar la conexión. ¿Configuraste las claves de Stripe?");
      window.location.href = data.url;
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={connect}
        disabled={loading}
        className="brand-gradient flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-ink transition hover:scale-[1.02] disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        {label}
      </button>
      {error && <p className="mt-3 text-sm text-fuchsia">{error}</p>}
    </div>
  );
}
