"use client";

import Link from "next/link";
import { Repeat2, ShieldCheck } from "lucide-react";
import { money } from "@/lib/money";

export interface ResaleItem { id: string; priceCents: number; }

export function ResaleListings({ currency, listings }: { currency: string; listings: ResaleItem[] }) {
  if (!listings.length) return null;
  return (
    <div className="glass mt-5 rounded-2xl border border-emerald-500/20 p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-emerald-300">
        <Repeat2 className="h-4 w-4" /> Reventa a precio justo
      </div>
      <p className="mb-3 flex items-center gap-1.5 text-xs text-muted">
        <ShieldCheck className="h-3.5 w-3.5 text-gold" /> {listings.length} {listings.length === 1 ? "boleto" : "boletos"} de otros fans · topado al precio original, sin scalping
      </p>
      <div className="space-y-2">
        {listings.slice(0, 6).map((l) => (
          <div key={l.id} className="flex items-center justify-between rounded-xl border border-line bg-surface/40 px-3 py-2 text-sm">
            <span className="font-display font-bold text-gold">{money(l.priceCents, currency)}</span>
            <Link href={`/r/${l.id}`} className="brand-gradient rounded-lg px-3 py-1.5 text-xs font-semibold text-ink">Comprar</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
