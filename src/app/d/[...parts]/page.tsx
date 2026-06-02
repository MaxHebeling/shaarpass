import Link from "next/link";
import type { Metadata } from "next";
import { Ticket, ChevronRight } from "lucide-react";
import { fetchPublishedEvents } from "@/lib/events";
import { EventCard, type EventCardData } from "@/components/discovery/EventCard";
import { parseGeo, geoLabel, categoryLabel, slugify, CATEGORIES } from "@/lib/seo";

export const dynamic = "force-dynamic";

function filterEvents(events: EventCardData[], geoSlug: string, categorySlug?: string) {
  const geo = parseGeo(geoSlug);
  return events.filter((e) => {
    const geoOk = geo.online
      ? e.is_online
      : geo.city
      ? slugify(e.region || "") === geo.region && slugify(e.city || "") === geo.city
      : slugify(e.region || "") === geo.region;
    const catOk = !categorySlug || slugify(e.category || "") === categorySlug;
    return geoOk && catOk;
  });
}

export async function generateMetadata({ params }: { params: Promise<{ parts: string[] }> }): Promise<Metadata> {
  const { parts } = await params;
  const geo = geoLabel(parseGeo(parts[0]));
  const cat = parts[1] ? categoryLabel(parts[1]) : null;
  const title = cat ? `${cat} en ${geo} | ShaarPass` : `Eventos en ${geo} | ShaarPass`;
  const description = `Descubre ${cat ? cat.toLowerCase() + " y cosas que hacer" : "eventos y cosas que hacer"} en ${geo}. Compra boletos con la comisión más baja.`;
  return { title, description, alternates: { canonical: `/d/${parts.join("/")}` }, openGraph: { title, description } };
}

export default async function DiscoveryPage({ params }: { params: Promise<{ parts: string[] }> }) {
  const { parts } = await params;
  const geoSlug = parts[0];
  const categorySlug = parts[1];
  const geo = parseGeo(geoSlug);
  const geoName = geoLabel(geo);
  const catName = categorySlug ? categoryLabel(categorySlug) : null;

  const all = await fetchPublishedEvents({ limit: 200 });
  const events = filterEvents(all, geoSlug, categorySlug);

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: "/" },
      { "@type": "ListItem", position: 2, name: geoName, item: `/d/${geoSlug}` },
      ...(catName ? [{ "@type": "ListItem", position: 3, name: catName, item: `/d/${geoSlug}/${categorySlug}` }] : []),
    ],
  };

  return (
    <main className="relative min-h-screen px-6 pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <header className="mx-auto max-w-6xl pt-10">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 font-display text-lg font-bold">
          <span className="brand-gradient grid h-8 w-8 place-items-center rounded-xl text-ink">
            <Ticket className="h-4 w-4" strokeWidth={2.5} />
          </span>
          ShaarPass
        </Link>

        {/* Breadcrumb visible */}
        <nav className="flex items-center gap-1.5 text-sm text-muted">
          <Link href="/descubrir" className="hover:text-fg">Descubrir</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href={`/d/${geoSlug}`} className="hover:text-fg">{geoName}</Link>
          {catName && (<><ChevronRight className="h-3.5 w-3.5" /><span className="text-fg">{catName}</span></>)}
        </nav>

        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight md:text-5xl">
          {catName ? `${catName} y cosas que hacer en ` : "Eventos en "}
          <span className="brand-text">{geoName}</span>
        </h1>
        <p className="mt-3 text-muted">
          {events.length > 0
            ? `${events.length} ${events.length === 1 ? "evento" : "eventos"} próximos · boletos con la comisión más baja del mercado.`
            : "Aún no hay eventos aquí. Vuelve pronto."}
        </p>

        {/* Filtros de categoría (enlaces crawleables) */}
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href={`/d/${geoSlug}`} className={`glass rounded-full px-4 py-1.5 text-sm ${!catName ? "border-fuchsia/50 text-fg" : "text-muted"}`}>Todo</Link>
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/d/${geoSlug}/${c.slug}`}
              className={`glass rounded-full px-4 py-1.5 text-sm transition hover:border-white/20 ${categorySlug === c.slug ? "border-fuchsia/50 text-fg" : "text-muted"}`}
            >
              {c.emoji} {c.label}
            </Link>
          ))}
        </div>
      </header>

      <section className="mx-auto mt-10 max-w-6xl">
        {events.length === 0 ? (
          <div className="glass rounded-3xl p-12 text-center text-muted">
            No hay eventos en esta categoría todavía.{" "}
            <Link href="/descubrir" className="brand-text font-semibold">Ver todos →</Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => <EventCard key={e.slug} e={e} />)}
          </div>
        )}
      </section>
    </main>
  );
}
