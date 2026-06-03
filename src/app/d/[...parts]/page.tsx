import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { fetchPublishedEvents } from "@/lib/events";
import { EventCard, type EventCardData } from "@/components/discovery/EventCard";
import { parseGeo, geoLabel, categoryLabel, slugify, CATEGORIES } from "@/lib/seo";

export const dynamic = "force-dynamic";

// Texto único por categoría (evita thin/duplicate content en las páginas /d/).
const CAT_INTRO: Record<string, string> = {
  musica: "conciertos, festivales y noches en vivo",
  conferencias: "conferencias, congresos y charlas",
  negocios: "expos, networking y eventos de negocios",
  "comida-y-bebida": "cenas, catas y festivales gastronómicos",
  arte: "teatro, exposiciones y eventos culturales",
  deportes: "partidos, torneos y eventos deportivos",
  comunidad: "eventos de iglesia, ministerios y reuniones comunitarias",
  tecnologia: "talleres, hackatones y eventos de tecnología",
};

function buildIntro(geoName: string, catName: string | null, categorySlug?: string): string {
  if (catName && categorySlug) {
    const kinds = CAT_INTRO[categorySlug] ?? `${catName.toLowerCase()} y más`;
    return `¿Buscas ${catName.toLowerCase()} en ${geoName}? Aquí encuentras ${kinds} con boletos a la venta, todo en un solo lugar. Compra con código QR seguro y paga en línea sin complicaciones. Los organizadores de ${geoName} eligen ShaarPass para vender entradas de ${catName.toLowerCase()} con la comisión más baja y transparente del mercado: 2% + $0.50 por boleto, sin cargos ocultos. Si organizas un evento de ${catName.toLowerCase()} en ${geoName}, publícalo gratis y empieza a vender en minutos.`;
  }
  return `Descubre los próximos eventos en ${geoName}: conciertos, conferencias, eventos de iglesia, teatro, deportes y más. Compra tus boletos con código QR seguro y la comisión más baja del mercado. ¿Organizas eventos en ${geoName}? Con ShaarPass publicas gratis, cobras a tu cuenta el mismo día y te quedas con más de cada boleto — sin la letra chica de otras plataformas.`;
}

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

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.shaarpass.io";
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: `${base}/` },
      { "@type": "ListItem", position: 2, name: geoName, item: `${base}/d/${geoSlug}` },
      ...(catName ? [{ "@type": "ListItem", position: 3, name: catName, item: `${base}/d/${geoSlug}/${categorySlug}` }] : []),
    ],
  };

  // ItemList con los eventos listados (rich result de listados + citabilidad).
  const itemList = events.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: catName ? `${catName} en ${geoName}` : `Eventos en ${geoName}`,
    numberOfItems: events.length,
    itemListElement: events.slice(0, 50).map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${base}/e/${e.slug}`,
      name: e.title,
    })),
  } : null;

  const intro = buildIntro(geoName, catName, categorySlug);

  return (
    <main className="relative min-h-screen px-6 pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      {itemList && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />}

      <header className="mx-auto max-w-6xl pt-10">
        <Link href="/" className="mb-8 inline-flex items-center gap-2.5 font-display text-lg font-bold">
          <img src="/logo-mark.png" alt="ShaarPass" className="h-9 w-9 rounded-xl" />
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
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted">{intro}</p>

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
