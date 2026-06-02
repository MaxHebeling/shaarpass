import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { PromoManager, type PromoRow } from "@/components/dashboard/PromoManager";
import { OrdersPanel, type OrderRow } from "@/components/dashboard/OrdersPanel";
import { SeatBuilder, type TierOption } from "@/components/dashboard/SeatBuilder";
import { EventVenueMap, type PublishedMap, type ZonePrice } from "@/components/dashboard/EventVenueMap";
import { ServicesManager, type ServiceRow } from "@/components/dashboard/ServicesManager";
import { CampaignComposer } from "@/components/dashboard/CampaignComposer";

export const dynamic = "force-dynamic";

export default async function EventManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();

  const { data: event } = await db
    .from("events")
    .select("id, slug, title, status, currency, starts_at")
    .eq("id", id)
    .maybeSingle<{ id: string; slug: string; title: string; status: string; currency: string; starts_at: string }>();
  if (!event) notFound();

  const { data: types } = await db
    .from("ticket_types")
    .select("id, name, price_cents, quantity_total, quantity_sold, is_seated")
    .eq("event_id", id)
    .order("price_cents");

  // Conteo de asientos por tier (para el builder).
  const { data: seatCounts } = await db
    .from("seats")
    .select("ticket_type_id")
    .eq("event_id", id);
  const seatByTier = new Map<string, number>();
  for (const s of seatCounts ?? []) seatByTier.set(s.ticket_type_id, (seatByTier.get(s.ticket_type_id) ?? 0) + 1);
  const tierOptions: TierOption[] = (types ?? []).map((t) => ({
    id: t.id, name: t.name, is_seated: t.is_seated, seat_count: seatByTier.get(t.id) ?? 0,
  }));

  const { data: promos } = await db
    .from("promo_codes")
    .select("id, code, discount_type, discount_value, max_redemptions, times_redeemed, expires_at")
    .eq("event_id", id)
    .order("code")
    .returns<PromoRow[]>();

  const { data: orders } = await db
    .from("orders")
    .select("id, buyer_email, total_cents, status, created_at")
    .eq("event_id", id)
    .order("created_at", { ascending: false })
    .returns<OrderRow[]>();

  // Mapa de recinto: opciones publicadas + estado de asociación + precios por zona.
  const { data: pubMaps } = await db
    .from("venue_maps").select("id, name, venues_v2(name)").eq("status", "published");
  const mapOptions: PublishedMap[] = (pubMaps ?? []).map((m) => ({
    id: m.id, label: `${(m.venues_v2 as unknown as { name: string } | null)?.name ?? "Recinto"} — ${m.name}`,
  }));
  const { data: emapRow } = await db.from("event_maps").select("map_id").eq("event_id", id).maybeSingle();
  let zonePrices: ZonePrice[] = [];
  if (emapRow) {
    const { data: pricing } = await db
      .from("event_zone_pricing").select("zone_id, price_cents, zones(name, color)").eq("event_id", id);
    const { data: esRows } = await db.from("event_seats").select("zone_id").eq("event_id", id);
    const cnt = new Map<string, number>();
    for (const s of esRows ?? []) cnt.set(s.zone_id, (cnt.get(s.zone_id) ?? 0) + 1);
    zonePrices = (pricing ?? []).map((p) => {
      const z = p.zones as unknown as { name: string; color: string } | null;
      return { zoneId: p.zone_id, name: z?.name ?? "Zona", color: z?.color ?? "#7c3aed", seats: cnt.get(p.zone_id) ?? 0, priceCents: p.price_cents };
    });
  }

  const { data: svcRows } = await db
    .from("services").select("id, name, kind, price_cents, inventory, sold, max_per_order")
    .eq("event_id", id).order("created_at").returns<ServiceRow[]>();

  const { data: buyerRows } = await db.from("orders").select("buyer_email").eq("event_id", id).eq("status", "paid");
  const buyersCount = new Set((buyerRows ?? []).map((o) => o.buyer_email)).size;
  const { count: waitlistCount } = await db.from("waitlist").select("id", { count: "exact", head: true }).eq("event_id", id);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard" className="mb-5 flex items-center gap-2 text-sm text-muted transition hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Mis eventos
      </Link>

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">{event.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {new Date(event.starts_at).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        {event.status === "published" && (
          <Link href={`/e/${event.slug}`} target="_blank" className="glass flex items-center gap-1.5 rounded-full px-4 py-2 text-sm transition hover:border-white/20">
            Ver página <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {/* Boletos */}
      <div className="glass mb-6 rounded-3xl p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">Boletos</h2>
        <div className="space-y-2">
          {(types ?? []).map((t, i) => (
            <div key={i} className="flex items-center justify-between rounded-2xl border border-line bg-surface/40 px-4 py-3 text-sm">
              <span className="font-medium">{t.name}</span>
              <span className="flex items-center gap-4 text-muted">
                <span className="text-gold">{money(t.price_cents, event.currency)}</span>
                <span>{t.quantity_sold}/{t.quantity_total} vendidos</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Órdenes + reembolsos + cancelar evento */}
      <div className="mb-6">
        <OrdersPanel eventId={id} currency={event.currency} cancelled={event.status === "cancelled"} initial={orders ?? []} />
      </div>

      {/* Mapa de recinto (nuevo modelo geométrico) */}
      <div className="mb-6">
        <EventVenueMap eventId={id} currency={event.currency} maps={mapOptions} attached={!!emapRow} zonePrices={zonePrices} />
      </div>

      {/* Email a compradores + lista de espera */}
      <div className="mb-6">
        <CampaignComposer eventId={id} buyers={buyersCount} waitlistCount={waitlistCount ?? 0} />
      </div>

      {/* Servicios / extras */}
      <div className="mb-6">
        <ServicesManager eventId={id} currency={event.currency} initial={svcRows ?? []} />
      </div>

      {/* Asientos numerados (modelo simple legacy) */}
      <div className="mb-6">
        <SeatBuilder eventId={id} tiers={tierOptions} />
      </div>

      {/* Promo codes */}
      <PromoManager eventId={id} currency={event.currency} initial={promos ?? []} />
    </div>
  );
}
