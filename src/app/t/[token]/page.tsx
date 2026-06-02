"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ShieldCheck, Loader2, RefreshCw } from "lucide-react";

export default function MobileTicketPage() {
  const { token } = useParams<{ token: string }>();
  const [payload, setPayload] = useState<string | null>(null);
  const [secsLeft, setSecsLeft] = useState(15);
  const [error, setError] = useState(false);

  async function refresh() {
    try {
      const res = await fetch(`/api/ticket/code?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok || !data.payload) { setError(true); return; }
      setPayload(data.payload);
      setSecsLeft(15);
    } catch { setError(true); }
  }

  useEffect(() => { refresh(); const id = setInterval(refresh, 15000); return () => clearInterval(id); }, [token]);
  useEffect(() => { const id = setInterval(() => setSecsLeft((s) => (s > 0 ? s - 1 : 0)), 1000); return () => clearInterval(id); }, []);

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="glass w-full max-w-sm rounded-3xl p-7 text-center">
        <div className="mb-1 flex items-center justify-center gap-2 font-display text-lg font-bold">
          <span className="brand-gradient grid h-7 w-7 place-items-center rounded-lg text-ink text-xs">SP</span> ShaarPass
        </div>
        <p className="mb-5 text-xs text-muted">Tu boleto · preséntalo en la entrada</p>

        {error ? (
          <p className="py-16 text-sm text-fuchsia">Boleto no encontrado.</p>
        ) : !payload ? (
          <div className="grid h-64 place-items-center"><Loader2 className="h-8 w-8 animate-spin text-muted" /></div>
        ) : (
          <>
            <div className="mx-auto w-fit rounded-2xl bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/qr?token=${encodeURIComponent(payload)}`} alt="QR" width={240} height={240} />
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gold">
              <RefreshCw className="h-4 w-4" /> Se actualiza en {secsLeft}s
            </div>
          </>
        )}

        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted">
          <ShieldCheck className="h-3.5 w-3.5 text-gold" /> Código seguro que rota cada 15s · una captura no sirve
        </p>
      </div>
    </main>
  );
}
