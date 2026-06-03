import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { MarketBand } from "@/components/landing/MarketBand";
import { UseCases } from "@/components/landing/UseCases";
import { FeeComparator } from "@/components/landing/FeeComparator";
import { ValueProps } from "@/components/landing/ValueProps";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { FAQ } from "@/components/landing/FAQ";
import { faqs } from "@/components/landing/faq-data";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.shaarpass.io";

const orgJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE}/#organization`,
      name: "ShaarPass",
      url: SITE,
      logo: `${SITE}/icon.svg`,
      description: "Plataforma de venta de boletos para eventos con la comisión más baja y transparente del mercado.",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      url: SITE,
      name: "ShaarPass",
      inLanguage: "es",
      publisher: { "@id": `${SITE}/#organization` },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE}/#faq`,
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export default function Home() {
  return (
    <main className="grain relative">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
      <Nav />
      <Hero />
      <MarketBand />
      <UseCases />
      <FeeComparator />
      <div className="relative">
        <div className="grid-bg absolute inset-0" />
        <div className="relative">
          <ValueProps />
          <HowItWorks />
        </div>
      </div>
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  );
}
