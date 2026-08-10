"use client";

import { useEffect } from "react";

/**
 * Boundary de último recurso: reemplaza el layout raíz si este falla, por eso
 * incluye <html>/<body> propios. Debe ser autosuficiente (sin depender de estilos globales).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[global-error]", error?.message, error?.digest ?? "");
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, background: "#0b0b0f", color: "#e7e7ea", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px", textAlign: "center" }}>
          <div style={{ maxWidth: 420 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700 }}>Servicio temporalmente no disponible</h1>
            <p style={{ marginTop: 12, color: "#a1a1aa", fontSize: 14 }}>
              Estamos teniendo problemas para cargar la aplicación. Intenta de nuevo en un momento.
            </p>
            {error?.digest && <p style={{ marginTop: 8, color: "#71717a", fontSize: 12 }}>Ref: {error.digest}</p>}
            <button
              onClick={reset}
              style={{ marginTop: 24, borderRadius: 999, padding: "10px 24px", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", background: "#d4af37", color: "#0b0b0f" }}
            >
              Reintentar
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
