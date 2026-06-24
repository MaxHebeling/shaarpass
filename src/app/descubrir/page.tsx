import Link from "next/link";
import type { Metadata } from "next";
import { Search, Ticket } from "lucide-react";
import { fetchPublishedEvents } from "@/lib/events";
import { EventCard } from "@/components/discovery/EventCard";
import { CATEGORIES, slugify, buildGeoSlug } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Descubre eventos cerca de ti | ShaarPass",
  description: "Conciertos, conferencias, talleres y más. Encuentra y compra boletos para los mejores eventos.",
  alternates: { canonical: "/descubrir" },
};

export default async function DescubrirPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const events = await fetchPublishedEvents({ q });

  // Ciudades presentes (para enlaces internos SEO).
  const cities = Array.from(
    new Map(
      events
        .filter((e) => !e.is_online && e.city)
        .map((e) => [`${e.region}-${e.city}`, { city: e.city!, region: e.region, geo: buildGeoSlug(e.region, e.city, false) }])
    ).values()
  ).slice(0, 8);

  return (
    <main className="relative min-h-screen px-6 pb-20">
      <header className="mx-auto max-w-6xl pt-10">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 font-display text-lg font-bold">
          <span className="brand-gradient grid h-8 w-8 place-items-center rounded-xl text-ink">
            <Ticket className="h-4 w-4" strokeWidth={2.5} />
          </span>
          ShaarPass
        </Link>

        <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
          Descubre <span className="brand-text">eventos</span>
        </h1>

        <form action="/descubrir" className="mt-6 flex max-w-xl items-center gap-2 glass rounded-2xl px-4">
          <Search className="h-5 w-5 text-muted" />
          <input
            name="q" defaultValue={q ?? ""} placeholder="Busca conciertos, conferencias, talleres…"
            className="w-full bg-transparent py-3.5 text-sm outline-none"
          />
          <button className="brand-gradient rounded-xl px-4 py-2 text-sm font-semibold text-ink">Buscar</button>
        </form>

        {/* Categorías */}
        <div className="mt-6 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/d/online/${c.slug}`}
              className="glass rounded-full px-4 py-2 text-sm transition hover:border-white/20"
            >
              {c.emoji} {c.label}
            </Link>
          ))}
        </div>
      </header>

      <section className="mx-auto mt-10 max-w-6xl">
        <h2 className="mb-4 font-display text-xl font-semibold">
          {q ? `Resultados para “${q}”` : "Próximos eventos"}
        </h2>
        {events.length === 0 ? (
          <p className="text-muted">No encontramos eventos. Prueba otra búsqueda.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => <EventCard key={e.slug} e={e} />)}
          </div>
        )}
      </section>

      {/* Enlaces internos por ciudad (SEO) */}
      {cities.length > 0 && (
        <section className="mx-auto mt-14 max-w-6xl border-t border-line pt-8">
          <h2 className="mb-4 font-display text-lg font-semibold">Eventos por ciudad</h2>
          <div className="flex flex-wrap gap-2">
            {cities.map((c) => (
              <Link key={c.geo} href={`/d/${c.geo}`} className="text-sm text-muted transition hover:text-fg">
                Eventos en {c.city}{c.region ? `, ${c.region}` : ""} ·
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
