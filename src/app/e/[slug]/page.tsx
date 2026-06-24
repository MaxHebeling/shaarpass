import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Calendar, MapPin, Clock, Ticket, Share2, ArrowRight } from "lucide-react";
import { createPublicClient } from "@/lib/supabase/public";
import { TicketSelector, type SelectableTicket } from "@/components/event/TicketSelector";
import { SeatMap, type SeatData, type TierInfo } from "@/components/event/SeatMap";
import { SalesMap, type SalesZone } from "@/components/event/SalesMap";
import { WaitlistForm } from "@/components/event/WaitlistForm";
import { QueueGate } from "@/components/event/QueueGate";
import { PresaleRegister } from "@/components/event/PresaleRegister";
import { ResaleListings, type ResaleItem } from "@/components/event/ResaleListings";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const db = createPublicClient();
  const { data: e } = await db
    .from("events")
    .select("title, description, cover_image, city, region, organizations(name, white_label)")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle<{ title: string; description: string | null; cover_image: string | null; city: string | null; region: string | null; organizations: { name: string; white_label: boolean } | null }>();

  if (!e) return { title: "Evento | ShaarPass" };
  const place = [e.city, e.region].filter(Boolean).join(", ");
  // White-label: la marca en el título es la del organizador, no ShaarPass.
  const brand = e.organizations?.white_label ? (e.organizations?.name ?? "") : "ShaarPass";
  const title = `${e.title}${place ? ` · ${place}` : ""}${brand ? ` | ${brand}` : ""}`;
  const description = (e.description ?? `Compra boletos para ${e.title}.`).slice(0, 160);
  return {
    title,
    description,
    alternates: { canonical: `/e/${slug}` },
    openGraph: { title, description, images: e.cover_image ? [e.cover_image] : undefined, type: "website" },
  };
}

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  category: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  currency: string;
  is_online: boolean;
  city: string | null;
  region: string | null;
  queue_enabled: boolean;
  onsale_at: string | null;
  presale_enabled: boolean;
  organizations: { name: string; logo_url: string | null; brand_color: string | null; white_label: boolean } | null;
  venues: { name: string; address: string | null; city: string | null } | null;
}

function fmtDate(iso: string, tz: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz,
  });
}
function fmtTime(iso: string, tz: string) {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: tz });
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createPublicClient();

  const { data: event } = await db
    .from("events")
    .select("id, title, description, cover_image, category, starts_at, ends_at, timezone, currency, is_online, city, region, queue_enabled, onsale_at, presale_enabled, organizations(name, logo_url, brand_color, white_label), venues(name, address, city)")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle<EventRow>();

  if (!event) notFound();

  const { data: types } = await db
    .from("ticket_types")
    .select("id, name, price_cents, currency, quantity_total, quantity_sold, max_per_order, is_seated")
    .eq("event_id", event.id)
    .order("price_cents", { ascending: true });

  const tickets: SelectableTicket[] = (types ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    price_cents: t.price_cents,
    currency: t.currency,
    remaining: Math.max(0, t.quantity_total - t.quantity_sold),
    max_per_order: t.max_per_order,
  }));

  // Reserved seating: si algún tier tiene asientos, cargamos el mapa.
  const isSeated = (types ?? []).some((t) => t.is_seated);
  let seats: SeatData[] = [];
  let seatTiers: TierInfo[] = [];
  if (isSeated) {
    const { data: seatRows } = await db
      .from("seats")
      .select("id, ticket_type_id, section, row_label, seat_num, pos_x, pos_y, status")
      .eq("event_id", event.id)
      .returns<SeatData[]>();
    seats = seatRows ?? [];
    seatTiers = (types ?? []).filter((t) => t.is_seated).map((t) => ({ id: t.id, name: t.name, price_cents: t.price_cents }));
  }

  // Nuevo modelo: ¿el evento usa un mapa de recinto? (tiene prioridad sobre el seating viejo)
  const { data: emap } = await db
    .from("event_maps")
    .select("map_id, venue_maps(width_m, height_m)")
    .eq("event_id", event.id)
    .maybeSingle<{ map_id: string; venue_maps: { width_m: number; height_m: number } | null }>();

  let salesZones: SalesZone[] = [];
  let mapW = 60, mapH = 40;
  if (emap) {
    mapW = Number(emap.venue_maps?.width_m ?? 60);
    mapH = Number(emap.venue_maps?.height_m ?? 40);
    const [{ data: zg }, { data: avail }, { data: pricing }] = await Promise.all([
      db.from("zones_geo").select("id, name, color, area_geojson").eq("map_id", emap.map_id),
      db.from("zone_availability").select("zone_id, available, total").eq("event_id", event.id),
      db.from("event_zone_pricing").select("zone_id, ticket_type_id, price_cents").eq("event_id", event.id),
    ]);
    const availMap = new Map((avail ?? []).map((a) => [a.zone_id, a]));
    const priceMap = new Map((pricing ?? []).map((p) => [p.zone_id, p]));
    salesZones = (zg ?? []).map((z) => {
      let points: [number, number][] = [];
      try {
        const ring = JSON.parse(z.area_geojson as string).coordinates?.[0] ?? [];
        points = ring.slice(0, -1).map((p: number[]) => [p[0], p[1]] as [number, number]);
      } catch {}
      const pr = priceMap.get(z.id);
      const av = availMap.get(z.id);
      return {
        id: z.id, name: z.name, color: z.color, points,
        ticketTypeId: pr?.ticket_type_id ?? null, priceCents: pr?.price_cents ?? 0,
        available: av?.available ?? 0, total: av?.total ?? 0,
      };
    });
  }
  const hasVenueMap = salesZones.length > 0;

  // Reventa fan-to-fan activa (precio justo).
  const { data: listingRows } = await db
    .from("listings").select("id, price_cents").eq("event_id", event.id).eq("status", "active")
    .order("price_cents", { ascending: true });
  const resaleListings: ResaleItem[] = (listingRows ?? []).map((l) => ({ id: l.id, priceCents: l.price_cents }));

  const venueLine = [event.venues?.name, event.venues?.city ?? event.city, event.region]
    .filter(Boolean)
    .join(", ");

  // Event JSON-LD → elegibilidad para Google Events / rich results.
  const lowestPriceCents = tickets.length ? Math.min(...tickets.map((t) => t.price_cents)) : null;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.shaarpass.io";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description ?? undefined,
    startDate: event.starts_at,
    endDate: event.ends_at,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: event.is_online
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    image: event.cover_image ? [event.cover_image] : undefined,
    location: event.is_online
      ? { "@type": "VirtualLocation", url: `${base}/e/${slug}` }
      : {
          "@type": "Place",
          name: event.venues?.name ?? venueLine,
          address: [event.venues?.address, event.venues?.city ?? event.city, event.region].filter(Boolean).join(", "),
        },
    organizer: event.organizations?.name
      ? { "@type": "Organization", name: event.organizations.name }
      : undefined,
    offers: tickets.map((t) => ({
      "@type": "Offer",
      name: t.name,
      price: (t.price_cents / 100).toFixed(2),
      priceCurrency: t.currency.toUpperCase(),
      availability: t.remaining > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      url: `${base}/e/${slug}`,
    })),
    ...(lowestPriceCents != null && { lowPrice: (lowestPriceCents / 100).toFixed(2) }),
  };

  return (
    <main className="relative min-h-screen pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* Cover */}
      <div className="relative h-[42vh] min-h-[320px] w-full overflow-hidden md:h-[52vh]">
        {event.cover_image && (
          <Image src={event.cover_image} alt={event.title} fill priority className="object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/20" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-6 pb-8">
          {event.organizations?.logo_url && (
            <img
              src={event.organizations.logo_url}
              alt={event.organizations.name}
              className="mb-4 h-14 w-auto max-w-[180px] object-contain drop-shadow-lg"
            />
          )}
          {event.category && (
            <span
              className="glass mb-3 inline-block rounded-full px-3 py-1 text-xs font-medium"
              style={{ color: event.organizations?.brand_color ?? "var(--color-gold)" }}
            >
              {event.category}
            </span>
          )}
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl md:text-6xl">
            {event.title}
          </h1>
          {event.organizations?.name && (
            <p className="mt-2 text-muted">por <span className="text-fg">{event.organizations.name}</span></p>
          )}
        </div>
      </div>

      <div className="mx-auto mt-10 grid max-w-6xl gap-10 px-6 lg:grid-cols-[1fr_380px]">
        {/* Detalle */}
        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoCard icon={Calendar} title="Fecha" lines={[fmtDate(event.starts_at, event.timezone)]} />
            <InfoCard icon={Clock} title="Hora" lines={[`${fmtTime(event.starts_at, event.timezone)} – ${fmtTime(event.ends_at, event.timezone)}`]} />
            <InfoCard icon={MapPin} title="Lugar" lines={[event.venues?.name ?? venueLine, event.venues?.address ?? ""].filter(Boolean)} />
            <InfoCard icon={Ticket} title="Boletos desde" lines={[tickets.length ? minPrice(tickets) : "—"]} />
          </div>

          {event.description && (
            <div className="mt-10">
              <h2 className="font-display text-2xl font-semibold">Sobre el evento</h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-muted">{event.description}</p>
            </div>
          )}

          <button className="-mx-2 mt-8 flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted transition hover:text-fg">
            <Share2 className="h-4 w-4" /> Compartir evento
          </button>
        </div>

        {/* Selector (sticky) */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <QueueGate eventId={event.id} enabled={event.queue_enabled} onsaleAt={event.onsale_at}>
            {hasVenueMap ? (
              <SalesMap eventId={event.id} eventSlug={slug} currency={event.currency} widthM={mapW} heightM={mapH} zones={salesZones} />
            ) : isSeated ? (
              <SeatMap eventId={event.id} eventSlug={slug} currency={event.currency} seats={seats} tiers={seatTiers} />
            ) : (
              <TicketSelector eventId={event.id} eventSlug={slug} tickets={tickets} />
            )}
          </QueueGate>
          {event.presale_enabled && <PresaleRegister eventId={event.id} />}
          <ResaleListings currency={event.currency} listings={resaleListings} />
          <WaitlistForm eventId={event.id} />
        </aside>
      </div>

      {/* Loop de crecimiento: cada evento público recluta organizadores.
          Se oculta en modo exclusivo (white-label). */}
      {!event.organizations?.white_label && (
        <aside className="mx-auto mt-16 max-w-6xl">
          <div className="glass ring-grad flex flex-col items-center justify-between gap-4 rounded-3xl px-6 py-7 text-center sm:flex-row sm:text-left">
            <div className="flex items-center gap-3">
              <img src="/logo-mark.png" alt="ShaarPass" className="hidden h-11 w-11 rounded-xl sm:block" />
              <div>
                <div className="font-display text-lg font-semibold">¿Tú organizas eventos?</div>
                <p className="mt-0.5 text-sm text-muted">Vende tus boletos con la comisión más baja y transparente del mercado. Publicar es gratis.</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Link href="/como-funciona" className="hidden text-sm text-muted transition hover:text-fg sm:block">Cómo funciona</Link>
              <Link href="/login" className="brand-gradient flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-ink transition hover:scale-[1.03]">
                Crear mi evento gratis <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </aside>
      )}
    </main>
  );
}

function minPrice(tickets: SelectableTicket[]) {
  const min = tickets.reduce((m, t) => Math.min(m, t.price_cents), Infinity);
  return (min / 100).toLocaleString("es-MX", { style: "currency", currency: tickets[0].currency.toUpperCase() });
}

function InfoCard({ icon: Icon, title, lines }: { icon: typeof Calendar; title: string; lines: string[] }) {
  return (
    <div className="glass flex gap-3 rounded-2xl p-4">
      <span className="brand-gradient grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink">
        <Icon className="h-5 w-5" strokeWidth={2.2} />
      </span>
      <div>
        <div className="text-xs text-muted">{title}</div>
        {lines.map((l, i) => (
          <div key={i} className={i === 0 ? "font-medium capitalize" : "text-sm text-muted"}>{l}</div>
        ))}
      </div>
    </div>
  );
}
