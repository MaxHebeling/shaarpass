import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Calendar, Layers, ShieldCheck, Sparkles } from "lucide-react";
import { createPublicClient } from "@/lib/supabase/public";
import { money } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const db = createPublicClient();
  const { data: s } = await db.from("seasons").select("title, description").eq("slug", slug).eq("status", "published").maybeSingle<{ title: string; description: string | null }>();
  if (!s) return { title: "Abono | ShaarPass" };
  const title = `${s.title} · Abono | ShaarPass`;
  return { title, description: (s.description ?? `Compra el abono ${s.title}.`).slice(0, 160), alternates: { canonical: `/s/${slug}` } };
}

interface SeasonEventRow {
  sort_order: number;
  events: { title: string; starts_at: string; city: string | null; region: string | null } | null;
}

export default async function SeasonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createPublicClient();

  const { data: season } = await db
    .from("seasons")
    .select("id, title, description, currency, price_cents, quantity_total, quantity_sold")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle<{ id: string; title: string; description: string | null; currency: string; price_cents: number; quantity_total: number; quantity_sold: number }>();
  if (!season) notFound();

  const { data: sevents } = await db
    .from("season_events")
    .select("sort_order, events(title, starts_at, city, region)")
    .eq("season_id", season.id)
    .order("sort_order")
    .returns<SeasonEventRow[]>();

  const events = (sevents ?? []).map((r) => r.events).filter(Boolean) as NonNullable<SeasonEventRow["events"]>[];
  const remaining = season.quantity_total - season.quantity_sold;
  const soldOut = remaining <= 0;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gold">
        <Layers className="h-4 w-4" /> Abono de temporada
      </div>
      <h1 className="font-display text-4xl font-bold">{season.title}</h1>
      {season.description && <p className="mt-3 text-muted">{season.description}</p>}

      <div className="glass mt-6 rounded-3xl p-6">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-sm text-muted">Precio del abono completo</div>
            <div className="font-display text-3xl font-bold text-gold">{money(season.price_cents, season.currency)}</div>
            <div className="mt-1 text-xs text-muted">{events.length} {events.length === 1 ? "evento" : "eventos"} · un boleto para cada uno</div>
          </div>
          {!soldOut && remaining <= 20 && <span className="rounded-full bg-fuchsia/15 px-3 py-1 text-xs text-fuchsia">Quedan {remaining}</span>}
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
          <ShieldCheck className="h-3.5 w-3.5 text-gold" /> Un solo pago · boletos con QR seguro · gestiónalos y transfiérelos desde tu cuenta
        </p>

        {soldOut ? (
          <div className="mt-5 rounded-2xl border border-line bg-surface/40 py-3.5 text-center text-sm text-muted">Abono agotado</div>
        ) : (
          <Link href={`/s/${slug}/checkout`} className="brand-gradient mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-ink">
            <Sparkles className="h-4 w-4" /> Comprar abono
          </Link>
        )}
      </div>

      <h2 className="mt-10 mb-3 font-display text-lg font-semibold">Eventos incluidos</h2>
      <div className="space-y-2">
        {events.map((e, i) => {
          const place = [e.city, e.region].filter(Boolean).join(", ");
          return (
            <div key={i} className="flex items-center justify-between rounded-2xl border border-line bg-surface/40 px-4 py-3 text-sm">
              <span className="font-medium">{e.title}</span>
              <span className="flex items-center gap-2 text-muted">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(e.starts_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                {place && <span className="hidden sm:inline">· {place}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </main>
  );
}
