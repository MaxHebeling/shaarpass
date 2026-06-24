import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";
import { getPost, allPosts } from "@/lib/blog/posts";

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.shaarpass.io";

export function generateStaticParams() {
  return allPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Artículo | ShaarPass" };
  return {
    title: `${post.title} | ShaarPass`,
    description: post.description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: { title: post.title, description: post.description, type: "article", publishedTime: post.dateISO },
  };
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: post.title,
        description: post.description,
        image: [`${SITE}/og.jpg`],
        datePublished: post.dateISO,
        dateModified: post.dateISO,
        inLanguage: "es",
        mainEntityOfPage: `${SITE}/blog/${slug}`,
        author: { "@type": "Organization", name: "ShaarPass", url: SITE },
        publisher: { "@type": "Organization", name: "ShaarPass", logo: { "@type": "ImageObject", url: `${SITE}/icon.png` } },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: SITE },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog` },
          { "@type": "ListItem", position: 3, name: post.title, item: `${SITE}/blog/${slug}` },
        ],
      },
    ],
  };

  return (
    <>
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <main className="grain relative px-6 pb-24 pt-36">
        <article className="mx-auto max-w-2xl">
          <Link href="/blog" className="mb-6 inline-flex items-center gap-2 text-sm text-muted transition hover:text-fg">
            <ArrowLeft className="h-4 w-4" /> Blog
          </Link>
          <div className="text-xs uppercase tracking-wider text-gold">{post.category}</div>
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight md:text-4xl">{post.title}</h1>
          <div className="mt-3 flex items-center gap-3 text-xs text-muted">
            <span>{post.date}</span><span>·</span><span>{post.readMins} min de lectura</span>
          </div>

          <div className="mt-8 space-y-5 text-[15px] leading-relaxed text-muted">
            {post.body.map((b, i) => {
              if (b.type === "h2") return <h2 key={i} className="font-display text-xl font-semibold text-fg">{b.text}</h2>;
              if (b.type === "ul") return (
                <ul key={i} className="list-disc space-y-1 pl-6">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
              );
              return <p key={i}>{b.text}</p>;
            })}
          </div>

          {/* CTA */}
          <div className="glass ring-grad mt-12 rounded-3xl p-7 text-center">
            <div className="font-display text-xl font-semibold">Publica tu evento gratis</div>
            <p className="mt-1 text-sm text-muted">Comisión más baja, pagos el mismo día y soporte humano.</p>
            <Link href="/login" className="brand-gradient mt-5 inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-semibold text-ink transition hover:scale-[1.03]">
              Crear mi evento <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
