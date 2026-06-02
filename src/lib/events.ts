import { createPublicClient } from "@/lib/supabase/public";
import type { EventCardData } from "@/components/discovery/EventCard";

interface Row {
  slug: string;
  title: string;
  cover_image: string | null;
  category: string | null;
  city: string | null;
  region: string | null;
  is_online: boolean;
  starts_at: string;
  currency: string;
  ticket_types: { price_cents: number }[] | null;
}

/** Eventos publicados y futuros, con precio mínimo calculado. */
export async function fetchPublishedEvents(opts: { q?: string; limit?: number } = {}): Promise<EventCardData[]> {
  const db = createPublicClient();
  let query = db
    .from("events")
    .select("slug, title, cover_image, category, city, region, is_online, starts_at, currency, ticket_types(price_cents)")
    .eq("status", "published")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(opts.limit ?? 60);

  if (opts.q?.trim()) query = query.ilike("title", `%${opts.q.trim()}%`);

  const { data } = await query.returns<Row[]>();
  return (data ?? []).map((e) => ({
    slug: e.slug,
    title: e.title,
    cover_image: e.cover_image,
    category: e.category,
    city: e.city,
    region: e.region,
    is_online: e.is_online,
    starts_at: e.starts_at,
    currency: e.currency,
    min_price_cents: e.ticket_types?.length ? Math.min(...e.ticket_types.map((t) => t.price_cents)) : null,
  }));
}
