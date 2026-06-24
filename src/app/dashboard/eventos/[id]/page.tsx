import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, BarChart3, Pencil, Ticket as TicketIcon, ShoppingBag, DoorOpen, Map as MapIcon, Megaphone } from "lucide-react";
import { DashboardTabs } from "@/components/dashboard/DashboardTabs";
import { createClient } from "@/lib/supabase/server";
import { PromoManager, type PromoRow } from "@/components/dashboard/PromoManager";
import { OrdersPanel, type OrderRow } from "@/components/dashboard/OrdersPanel";
import { SeatBuilder, type TierOption } from "@/components/dashboard/SeatBuilder";
import { EventVenueMap, type PublishedMap, type ZonePrice } from "@/components/dashboard/EventVenueMap";
import { ServicesManager, type ServiceRow } from "@/components/dashboard/ServicesManager";
import { CampaignsPanel, type CampaignRow } from "@/components/dashboard/CampaignsPanel";
import { AutomationsPanel, type AutoState } from "@/components/dashboard/AutomationsPanel";
import { QueueControl } from "@/components/dashboard/QueueControl";
import { PresaleControl } from "@/components/dashboard/PresaleControl";
import { EventCover } from "@/components/dashboard/EventCover";
import { EventDetailsEditor } from "@/components/dashboard/EventDetailsEditor";
import { TicketTypesEditor } from "@/components/dashboard/TicketTypesEditor";
import { EventStats, type DayPoint } from "@/components/dashboard/EventStats";
import { StaffPanel, type StaffRow } from "@/components/dashboard/StaffPanel";
import { CheckinAnalytics, type Bucket, type RecentScan } from "@/components/dashboard/CheckinAnalytics";
import { ShareEvent } from "@/components/dashboard/ShareEvent";

export const dynamic = "force-dynamic";

export default async function EventManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();

  const { data: event } = await db
    .from("events")
    .select("id, org_id, slug, title, description, category, status, currency, starts_at, ends_at, timezone, city, region, cover_image, is_online, notify_on_change, queue_enabled, onsale_at, queue_wave_size, max_tickets_per_buyer, safetix_enabled, presale_enabled, presale_ends_at")
    .eq("id", id)
    .maybeSingle<{ id: string; org_id: string; slug: string; title: string; description: string | null; category: string | null; status: string; currency: string; starts_at: string; ends_at: string; timezone: string; city: string | null; region: string | null; cover_image: string | null; is_online: boolean; notify_on_change: boolean; queue_enabled: boolean; onsale_at: string | null; queue_wave_size: number; max_tickets_per_buyer: number | null; safetix_enabled: boolean; presale_enabled: boolean; presale_ends_at: string | null }>();
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
    .select("id, buyer_email, buyer_name, buyer_phone, buyer_city, buyer_country, total_cents, status, created_at")
    .eq("event_id", id)
    .order("created_at", { ascending: false })
    .returns<OrderRow[]>();

  // Mapa de recinto: solo los mapas publicados de TU organización (no de otras).
  const { data: pubMaps } = await db
    .from("venue_maps").select("id, name, venues_v2!inner(name, org_id)")
    .eq("status", "published").eq("venues_v2.org_id", event.org_id);
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

  // Analítica del evento (dashboard pro estilo Eventbrite).
  const { data: paidAgg } = await db.from("orders")
    .select("subtotal_cents, created_at").eq("event_id", id).eq("status", "paid");
  const ticketsSold = (types ?? []).reduce((s, t) => s + (t.quantity_sold || 0), 0);
  const capacity = (types ?? []).reduce((s, t) => s + (t.quantity_total || 0), 0);
  const netCents = (paidAgg ?? []).reduce((s, o) => s + (o.subtotal_cents || 0), 0);
  const ordersCount = (paidAgg ?? []).length;

  // Serie diaria: ventana de 14–30 días (desde la primera venta, acotada).
  const DAY = 86_400_000;
  const byDay = new Map<string, number>();
  for (const o of paidAgg ?? []) {
    const k = new Date(o.created_at).toISOString().slice(0, 10);
    byDay.set(k, (byDay.get(k) ?? 0) + (o.subtotal_cents || 0));
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const saleKeys = [...byDay.keys()].sort();
  const earliest = saleKeys[0] ? new Date(saleKeys[0]).getTime() : today.getTime();
  const startMs = Math.max(today.getTime() - 29 * DAY, Math.min(earliest, today.getTime() - 13 * DAY));
  const series: DayPoint[] = [];
  for (let t = startMs; t <= today.getTime(); t += DAY) {
    const k = new Date(t).toISOString().slice(0, 10);
    series.push({ label: k, cents: byDay.get(k) ?? 0 });
  }

  const { data: staffRows } = await db.from("event_staff")
    .select("id, name, gate, role, token, revoked, scans_count, last_active_at")
    .eq("event_id", id).order("created_at").returns<StaffRow[]>();

  // Analítica de Control de Acceso (ingresos por hora / puerta / tipo).
  const [{ count: checkedInCount }, { count: registeredCount }] = await Promise.all([
    db.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", id).eq("status", "checked_in"),
    db.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", id).in("status", ["valid", "checked_in"]),
  ]);
  const { data: logs } = await db.from("checkin_log")
    .select("at, gate, tickets(ticket_types(name), orders(buyer_name))")
    .eq("event_id", id).order("at", { ascending: false }).limit(500);

  const tz = event.timezone || "America/Mexico_City";
  const byGate = new Map<string, number>(), byType = new Map<string, number>(), byHour = new Map<number, number>();
  type LogRow = { at: string; gate: string | null; tickets: { ticket_types: { name: string } | null; orders: { buyer_name: string | null } | null } | null };
  for (const l of (logs ?? []) as unknown as LogRow[]) {
    byGate.set(l.gate || "General", (byGate.get(l.gate || "General") ?? 0) + 1);
    const tname = l.tickets?.ticket_types?.name ?? "Boleto";
    byType.set(tname, (byType.get(tname) ?? 0) + 1);
    const d = new Date(l.at); d.setMinutes(0, 0, 0);
    byHour.set(d.getTime(), (byHour.get(d.getTime()) ?? 0) + 1);
  }
  const hourLabel = (ms: number) => new Date(ms).toLocaleTimeString("es-MX", { hour: "numeric", hour12: true, timeZone: tz }).replace(/\s/g, "");
  const byHourArr: Bucket[] = [...byHour.entries()].sort((a, b) => a[0] - b[0]).slice(-12).map(([ms, c]) => ({ label: hourLabel(ms), count: c }));
  const toBuckets = (m: Map<string, number>): Bucket[] => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
  const recent: RecentScan[] = ((logs ?? []) as unknown as LogRow[]).slice(0, 10).map((l) => ({
    name: l.tickets?.orders?.buyer_name || "Asistente", type: l.tickets?.ticket_types?.name || "Boleto", gate: l.gate, at: l.at,
  }));

  // Campañas + datos para segmentación.
  const { data: campaignRowsAll } = await db.from("campaigns")
    .select("id, name, subject, status, scheduled_at, recipients_count, sent_count, created_at, kind, automation_key")
    .eq("event_id", id).order("created_at", { ascending: false })
    .returns<(CampaignRow & { kind: string; automation_key: string | null })[]>();
  const campaignRows: CampaignRow[] = (campaignRowsAll ?? []).filter((c) => c.kind !== "automation");
  const autoEnabled: Record<string, AutoState> = {};
  for (const c of campaignRowsAll ?? []) if (c.kind === "automation" && c.automation_key) autoEnabled[c.automation_key] = { scheduledAt: c.scheduled_at, status: c.status };
  const { data: regRows } = await db.from("orders").select("buyer_email, buyer_name, buyer_country").eq("event_id", id).eq("status", "paid");
  const countryOptions = [...new Set((regRows ?? []).map((r) => r.buyer_country).filter(Boolean) as string[])];
  const regMap = new Map<string, { email: string; name: string }>();
  for (const r of regRows ?? []) { const e = (r.buyer_email ?? "").toLowerCase(); if (e && !regMap.has(e)) regMap.set(e, { email: e, name: r.buyer_name ?? e }); }
  const registrants = [...regMap.values()].slice(0, 500);

  const { count: presaleReg } = await db.from("presale_registrations").select("id", { count: "exact", head: true }).eq("event_id", id);
  const { count: presaleSel } = await db.from("presale_registrations").select("id", { count: "exact", head: true }).eq("event_id", id).eq("selected", true);

  const statusBadge: Record<string, string> = {
    published: "bg-emerald-500/10 text-emerald-300", draft: "bg-surface-2 text-muted",
    cancelled: "bg-fuchsia/10 text-fuchsia", ended: "bg-surface-2 text-muted",
  };
  const statusLabel: Record<string, string> = { published: "Publicado", draft: "Borrador", cancelled: "Cancelado", ended: "Finalizado" };

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/dashboard" className="mb-4 flex items-center gap-2 text-sm text-muted transition hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Mis eventos
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate font-display text-2xl font-bold sm:text-3xl">{event.title}</h1>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusBadge[event.status] ?? "bg-surface-2 text-muted"}`}>
              {statusLabel[event.status] ?? event.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {new Date(event.starts_at).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        {event.status === "published" && (
          <Link href={`/e/${event.slug}`} target="_blank" className="glass flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm transition hover:border-white/20">
            Ver página <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      <DashboardTabs
        tabs={[
          {
            id: "resumen", label: "Resumen", icon: <BarChart3 className="h-4 w-4" />,
            content: (
              <>
                {event.status === "published" && <ShareEvent slug={event.slug} title={event.title} />}
                <EventStats currency={event.currency} netCents={netCents} ticketsSold={ticketsSold} capacity={capacity} ordersCount={ordersCount} series={series} />
                <CheckinAnalytics
                  registered={registeredCount ?? 0} checkedIn={checkedInCount ?? 0} capacity={capacity}
                  byHour={byHourArr} byGate={toBuckets(byGate)} byType={toBuckets(byType)}
                  staff={(staffRows ?? []).map((s) => ({ name: s.name, gate: s.gate, scans: s.scans_count, lastActive: s.last_active_at, revoked: s.revoked }))}
                  recent={recent}
                />
              </>
            ),
          },
          {
            id: "detalles", label: "Detalles", icon: <Pencil className="h-4 w-4" />,
            content: (
              <>
                <EventDetailsEditor e={{
                  id: event.id, title: event.title, description: event.description, category: event.category,
                  city: event.city, region: event.region, startsAt: event.starts_at, endsAt: event.ends_at,
                  timezone: event.timezone, currency: event.currency, isOnline: event.is_online, notifyOnChange: event.notify_on_change,
                }} />
                <EventCover eventId={id} initial={event.cover_image} />
              </>
            ),
          },
          {
            id: "boletos", label: "Boletos", icon: <TicketIcon className="h-4 w-4" />,
            content: (
              <>
                <TicketTypesEditor eventId={id} currency={event.currency} initial={(types ?? []).map((t) => ({
                  id: t.id, name: t.name, price_cents: t.price_cents, quantity_total: t.quantity_total, quantity_sold: t.quantity_sold,
                }))} />
                <ServicesManager eventId={id} currency={event.currency} initial={svcRows ?? []} />
                <PromoManager eventId={id} currency={event.currency} initial={promos ?? []} />
              </>
            ),
          },
          {
            id: "ordenes", label: "Órdenes", icon: <ShoppingBag className="h-4 w-4" />,
            content: <OrdersPanel eventId={id} currency={event.currency} cancelled={event.status === "cancelled"} initial={orders ?? []} />,
          },
          {
            id: "acceso", label: "Acceso", icon: <DoorOpen className="h-4 w-4" />,
            content: (
              <>
                <StaffPanel eventId={id} eventTitle={event.title} initial={staffRows ?? []} />
                <QueueControl eventId={id} enabled={event.queue_enabled} onsaleAt={event.onsale_at} waveSize={event.queue_wave_size} maxPerBuyer={event.max_tickets_per_buyer} safetix={event.safetix_enabled} />
                <PresaleControl eventId={id} enabled={event.presale_enabled} endsAt={event.presale_ends_at} registered={presaleReg ?? 0} selected={presaleSel ?? 0} />
              </>
            ),
          },
          {
            id: "recinto", label: "Recinto", icon: <MapIcon className="h-4 w-4" />,
            content: (
              <>
                <EventVenueMap eventId={id} currency={event.currency} maps={mapOptions} attached={!!emapRow} zonePrices={zonePrices} />
                <SeatBuilder eventId={id} tiers={tierOptions} />
              </>
            ),
          },
          {
            id: "marketing", label: "Marketing", icon: <Megaphone className="h-4 w-4" />,
            content: (
              <>
                <AutomationsPanel eventId={id} startsAt={event.starts_at} endsAt={event.ends_at} enabled={autoEnabled} />
                <CampaignsPanel eventId={id} defaultTz={event.timezone} ticketTypes={(types ?? []).map((t) => ({ id: t.id, name: t.name }))} countries={countryOptions} registrants={registrants} initial={campaignRows ?? []} />
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
