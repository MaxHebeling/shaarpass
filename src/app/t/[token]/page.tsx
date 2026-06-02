"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ShieldCheck, Loader2, RefreshCw, Send, Tag } from "lucide-react";
import { SellerPayoutButton } from "@/components/resale/SellerPayoutButton";

export default function MobileTicketPage() {
  const { token } = useParams<{ token: string }>();
  const [payload, setPayload] = useState<string | null>(null);
  const [secsLeft, setSecsLeft] = useState(15);
  const [error, setError] = useState(false);
  // Gestión: transferir / revender
  const [open, setOpen] = useState<"none" | "transfer" | "resale">("none");
  const [toEmail, setToEmail] = useState("");
  const [price, setPrice] = useState("");
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [transferred, setTransferred] = useState(false);
  const [listed, setListed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doTransfer() {
    setBusy(true); setActionMsg(null);
    const res = await fetch("/api/ticket/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, toEmail }) });
    const data = await res.json(); setBusy(false);
    if (!res.ok) { setActionMsg(data.error || "Error"); return; }
    setTransferred(true);
  }
  async function doList() {
    setBusy(true); setActionMsg(null);
    const res = await fetch("/api/ticket/list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, priceCents: Math.round(Number(price) * 100) }) });
    const data = await res.json(); setBusy(false);
    if (res.ok) { setListed(true); setActionMsg("✅ En reventa al precio justo. Comparte el enlace de tu evento."); }
    else setActionMsg(data.error || "Error");
  }

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

        {/* Gestión del boleto */}
        {transferred ? (
          <div className="mt-5 rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            ✅ Boleto transferido. El nuevo dueño recibió su enlace. Este ya no es válido.
          </div>
        ) : payload && (
          <div className="mt-5 border-t border-line pt-4 text-left">
            <div className="mb-2 flex gap-2">
              <button onClick={() => setOpen(open === "transfer" ? "none" : "transfer")} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-sm transition hover:border-white/20"><Send className="h-4 w-4" /> Transferir</button>
              <button onClick={() => setOpen(open === "resale" ? "none" : "resale")} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-sm transition hover:border-white/20"><Tag className="h-4 w-4" /> Revender</button>
            </div>
            {open === "transfer" && (
              <div className="flex gap-2">
                <input type="email" value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="correo del amigo"
                  className="flex-1 rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60" />
                <button onClick={doTransfer} disabled={busy || !toEmail} className="brand-gradient rounded-xl px-4 text-sm font-semibold text-ink disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar"}</button>
              </div>
            )}
            {open === "resale" && (
              <div className="flex gap-2">
                <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="precio (≤ original)"
                  className="flex-1 rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60" />
                <button onClick={doList} disabled={busy || !price} className="brand-gradient rounded-xl px-4 text-sm font-semibold text-ink disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Listar"}</button>
              </div>
            )}
            {actionMsg && <p className="mt-2 text-xs text-muted">{actionMsg}</p>}
            {listed && <SellerPayoutButton token={token} label="Conectar cuenta para cobrar cuando se venda" />}
            <p className="mt-2 text-center text-[11px] text-muted">Reventa topada al precio original · sin scalping</p>
          </div>
        )}
      </div>
    </main>
  );
}
