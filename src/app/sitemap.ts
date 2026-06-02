import type { MetadataRoute } from "next";
import { fetchPublishedEvents } from "@/lib/events";
import { buildGeoSlug, slugify, CATEGORIES } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.shaarpass.io";
  const events = await fetchPublishedEvents({ limit: 1000 });

  const urls: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/descubrir`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/precios`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/como-funciona`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/nosotros`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/fundador`, changeFrequency: "monthly", priority: 0.6 },
  ];

  // Páginas de evento.
  for (const e of events) {
    urls.push({ url: `${base}/e/${e.slug}`, lastModified: new Date(e.starts_at), changeFrequency: "daily", priority: 0.8 });
  }

  // Páginas programáticas ciudad × categoría presentes.
  const geos = new Set<string>();
  const geoCats = new Set<string>();
  for (const e of events) {
    const geo = buildGeoSlug(e.region, e.city, e.is_online);
    geos.add(geo);
    const catSlug = CATEGORIES.find((c) => c.slug === slugify(e.category || ""))?.slug;
    if (catSlug) geoCats.add(`${geo}/${catSlug}`);
  }
  for (const g of geos) urls.push({ url: `${base}/d/${g}`, changeFrequency: "daily", priority: 0.7 });
  for (const gc of geoCats) urls.push({ url: `${base}/d/${gc}`, changeFrequency: "daily", priority: 0.7 });

  return urls;
}
