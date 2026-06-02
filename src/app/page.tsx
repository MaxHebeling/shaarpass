import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { MarketBand } from "@/components/landing/MarketBand";
import { UseCases } from "@/components/landing/UseCases";
import { FeeComparator } from "@/components/landing/FeeComparator";
import { ValueProps } from "@/components/landing/ValueProps";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { FAQ } from "@/components/landing/FAQ";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";

export default function Home() {
  return (
    <main className="grain relative">
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
