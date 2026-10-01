"use client";

import { useState, useEffect } from "react";
import { Copy, Check, MessageCircle, Share2, ExternalLink, Download, QrCode, RefreshCw } from "lucide-react";
import QRCode from "qrcode";

function triggerDownload(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

/** Panel para compartir el evento publicado (distribución = la palanca de venta). */
export function ShareEvent({ slug, title }: { slug: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const [qrPng, setQrPng] = useState<string | null>(null);
  // Origen se fija tras montar → server y cliente renderizan igual (sin hydration mismatch).
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/e/${slug}`;
  const ogUrl = `/e/${slug}/og`;
  const msg = `🎟️ ${title} — consigue tus boletos aquí: ${url}`;

  useEffect(() => {
    if (!origin) return;
    QRCode.toDataURL(url, { width: 480, margin: 1, color: { dark: "#08080c", light: "#ffffff" } }).then(setQrPng).catch(() => {});
  }, [url, origin]);

  async function downloadQr(kind: "png" | "svg") {
    if (kind === "png") { if (qrPng) triggerDownload(qrPng, `qr-${slug}.png`); return; }
    const svg = await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#08080c", light: "#ffffff" } });
    const href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    triggerDownload(href, `qr-${slug}.svg`);
    setTimeout(() => URL.revokeObjectURL(href), 2000);
  }

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
        <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 rounded-xl border border-line px-3.5 py-2 text-sm font-medium transition hover:border-white/20">LinkedIn</a>
        <button onClick={nativeShare} className="flex items-center gap-1.5 rounded-xl border border-line px-3.5 py-2 text-sm font-medium transition hover:border-white/20">
          <Share2 className="h-4 w-4" /> Más
        </button>
        <a href={`/e/${slug}`} target="_blank" className="flex items-center gap-1.5 rounded-xl border border-line px-3.5 py-2 text-sm font-medium transition hover:border-white/20">
          <ExternalLink className="h-4 w-4" /> Ver página
        </a>
      </div>

      {/* Previsualización social (Open Graph auto-generado) + QR */}
      <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <div className="mb-2 text-xs uppercase tracking-wide text-muted">Previsualización al compartir</div>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            {/* La imagen OG real (1200×630). Así es como se verá el enlace en WhatsApp/FB/LinkedIn. */}
            <img src={ogUrl} alt="Previsualización Open Graph del evento" className="aspect-[1200/630] w-full object-cover" />
            <div className="truncate border-t border-line px-3 py-2 text-xs text-muted">{url.replace(/^https?:\/\//, "")}</div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="mb-0.5 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted"><QrCode className="h-3.5 w-3.5" /> QR</div>
          <div className="rounded-2xl border border-line bg-white p-2">
            {qrPng ? <img src={qrPng} alt="Código QR del evento" className="h-[132px] w-[132px]" /> : <div className="h-[132px] w-[132px]" />}
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => downloadQr("png")} className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium transition hover:border-white/20">
              <Download className="h-3 w-3" /> PNG
            </button>
            <button onClick={() => downloadQr("svg")} className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium transition hover:border-white/20">
              <Download className="h-3 w-3" /> SVG
            </button>
          </div>
        </div>
      </div>

      {/* Refrescar la vista previa cacheada por las redes sociales */}
      <div className="mt-5 rounded-2xl border border-line bg-surface/40 p-4">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <RefreshCw className="h-3.5 w-3.5 text-gold" /> ¿La vista previa no se actualiza?
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          WhatsApp, Facebook y LinkedIn guardan la vista previa de un enlace por horas o días. Si cambiaste la portada,
          el título o la fecha, vuelve a escanear el enlace aquí para que muestren la versión nueva (WhatsApp usa la caché de Facebook).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={`https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 rounded-xl border border-line px-3.5 py-2 text-sm font-medium transition hover:border-white/20">
            <RefreshCw className="h-3.5 w-3.5" /> Facebook / WhatsApp
          </a>
          <a href={`https://www.linkedin.com/post-inspector/inspect/${encodeURIComponent(url)}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 rounded-xl border border-line px-3.5 py-2 text-sm font-medium transition hover:border-white/20">
            <RefreshCw className="h-3.5 w-3.5" /> LinkedIn
          </a>
        </div>
      </div>
    </div>
  );
}
