import type { ReactNode } from "react";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";

export function LegalLayout({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <>
      <Nav />
      <main className="grain relative px-6 pb-24 pt-36">
        <article className="mx-auto max-w-3xl">
          <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">{title}</h1>
          <p className="mt-3 text-sm text-muted">Última actualización: {updated}</p>
          <div className="legal-prose mt-8 space-y-6 text-[15px] leading-relaxed text-muted">
            {children}
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
