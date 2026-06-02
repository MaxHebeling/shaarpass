import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SeasonEditor, type SeasonEventItem, type PickableEvent } from "@/components/dashboard/SeasonEditor";

export const dynamic = "force-dynamic";

export default async function SeasonManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();

  const { data: season } = await db
    .from("seasons")
    .select("id, slug, title, currency, price_cents, quantity_total, quantity_sold, status")
    .eq("id", id)
    .maybeSingle<{ id: string; slug: string; title: string; currency: string; price_cents: number; quantity_total: number; quantity_sold: number; status: string }>();
  if (!season) notFound();

  // Eventos actualmente en el abono (con el ticket_type que otorga).
  const { data: sevRows } = await db
    .from("season_events")
    .select("event_id, sort_order, events(title, starts_at), ticket_types(name, price_cents)")
    .eq("season_id", id)
    .order("sort_order");
  const current: SeasonEventItem[] = (sevRows ?? []).map((r) => {
    const e = r.events as unknown as { title: string; starts_at: string } | null;
    const tt = r.ticket_types as unknown as { name: string; price_cents: number } | null;
    return { eventId: r.event_id, eventTitle: e?.title ?? "Evento", startsAt: e?.starts_at ?? "", ticketTypeName: tt?.name ?? "", ticketTypePriceCents: tt?.price_cents ?? 0 };
  });

  // Eventos publicados de la org disponibles para agregar (con sus ticket_types).
  const { data: evRows } = await db
    .from("events")
    .select("id, title, starts_at, ticket_types(id, name, price_cents)")
    .eq("status", "published")
    .order("starts_at");
  const inSeason = new Set(current.map((c) => c.eventId));
  const pickable: PickableEvent[] = (evRows ?? [])
    .filter((e) => !inSeason.has(e.id))
    .map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.starts_at,
      ticketTypes: ((e.ticket_types as unknown as { id: string; name: string; price_cents: number }[]) ?? []),
    }))
    .filter((e) => e.ticketTypes.length > 0);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/abonos" className="mb-5 flex items-center gap-2 text-sm text-muted transition hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Abonos
      </Link>
      <SeasonEditor
        seasonId={season.id}
        slug={season.slug}
        title={season.title}
        currency={season.currency}
        priceCents={season.price_cents}
        sold={season.quantity_sold}
        total={season.quantity_total}
        status={season.status}
        current={current}
        pickable={pickable}
      />
    </div>
  );
}
