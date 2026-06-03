import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";
import { allPosts } from "@/lib/blog/posts";

export const metadata: Metadata = {
  title: "Blog — ShaarPass | Guías para vender boletos de tus eventos",
  description: "Consejos prácticos para organizadores: cómo cobrar entradas, bajar comisiones, llenar tu evento y vender boletos sin complicarte.",
  alternates: { canonical: "/blog" },
};

export default function BlogIndex() {
  const posts = allPosts();
  return (
    <>
      <Nav />
      <main className="grain relative px-6 pb-24 pt-36">
        <section className="mx-auto max-w-3xl">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gold">
            <BookOpen className="h-4 w-4" /> Blog
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
            Guías para <span className="brand-text">vender más</span>
          </h1>
          <p className="mt-3 text-muted">Lo que aprendimos ayudando a organizadores a cobrar entradas sin perder en el camino.</p>

          <div className="mt-10 space-y-4">
            {posts.map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`}
                className="ring-grad lift glass block rounded-3xl p-6 transition">
                <div className="text-xs uppercase tracking-wider text-gold">{p.category}</div>
                <h2 className="mt-2 font-display text-xl font-semibold">{p.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{p.description}</p>
                <div className="mt-4 flex items-center gap-3 text-xs text-muted">
                  <span>{p.date}</span><span>·</span><span>{p.readMins} min de lectura</span>
                  <span className="ml-auto flex items-center gap-1 text-fg">Leer <ArrowRight className="h-3.5 w-3.5" /></span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
