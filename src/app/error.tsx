"use client";

import { useEffect } from "react";
import Link from "next/link";

/** Boundary de errores de segmento. Muestra un mensaje amable y ofrece reintentar. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // El servidor ya capturó el error (instrumentation.onRequestError). Aquí solo dejamos rastro en el cliente.
    console.error("[client-error]", error?.message, error?.digest ?? "");
  }, [error]);

  return (
    <main className="grid min-h-[70vh] place-items-center px-6 text-center">
      <div className="glass ring-grad max-w-md rounded-3xl p-8">
        <h1 className="font-display text-2xl font-bold">Algo salió mal</h1>
        <p className="mt-3 text-sm text-muted">
          Tuvimos un problema al procesar esta página. Puedes reintentar; si persiste, vuelve al inicio.
        </p>
        {error?.digest && <p className="mt-2 text-xs text-muted">Ref: {error.digest}</p>}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button onClick={reset} className="brand-gradient rounded-full px-6 py-2.5 text-sm font-semibold text-ink">
            Reintentar
          </button>
          <Link href="/" className="rounded-full px-6 py-2.5 text-sm font-semibold text-fg ring-1 ring-line">
            Ir al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
