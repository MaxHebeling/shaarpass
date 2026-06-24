"use client";

import { useState } from "react";
import { Copy, Check, MessageCircle, Share2, ExternalLink } from "lucide-react";

/** Panel para compartir el evento publicado (distribución = la palanca de venta). */
export function ShareEvent({ slug, title }: { slug: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/e/${slug}` : `/e/${slug}`;
  const msg = `🎟️ ${title} — consigue tus boletos aquí: ${url}`;

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* noop */ }
  }
  function nativeShare() {
    if (navigator.share) navigator.share({ title, text: msg, url }).catch(() => {});
    else copy();
  }

  return (
    <div className="glass rounded-3xl p-6">
      <div className="mb-1 flex items-center gap-2">
        <Share2 className="h-4 w-4 text-gold" />
        <h2 className="font-display text-lg font-semibold">Comparte tu evento</h2>
      </div>
      <p className="mb-4 text-sm text-muted">Tu evento está publicado. Repartir el enlace es lo que llena el lugar — empieza por WhatsApp.</p>

      {/* Enlace + copiar */}
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface/40 p-2 pl-4">
        <span className="min-w-0 flex-1 truncate text-sm text-muted">{url}</span>
        <button onClick={copy} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-medium transition hover:border-white/20">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copiado" : "Copiar"}
        </button>
      </div>

      {/* Canales */}
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3.5 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20">
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </a>
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 rounded-xl border border-line px-3.5 py-2 text-sm font-medium transition hover:border-white/20">Facebook</a>
        <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 rounded-xl border border-line px-3.5 py-2 text-sm font-medium transition hover:border-white/20">X</a>
        <button onClick={nativeShare} className="flex items-center gap-1.5 rounded-xl border border-line px-3.5 py-2 text-sm font-medium transition hover:border-white/20">
          <Share2 className="h-4 w-4" /> Más
        </button>
        <a href={`/e/${slug}`} target="_blank" className="flex items-center gap-1.5 rounded-xl border border-line px-3.5 py-2 text-sm font-medium transition hover:border-white/20">
          <ExternalLink className="h-4 w-4" /> Ver página
        </a>
      </div>
    </div>
  );
}
