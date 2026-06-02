import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { MarketBand } from "@/components/landing/MarketBand";
import { FeeComparator } from "@/components/landing/FeeComparator";
import { ValueProps } from "@/components/landing/ValueProps";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";

export default function Home() {
  return (
    <main className="relative">
      <Nav />
      <Hero />
      <MarketBand />
      <FeeComparator />
      <ValueProps />
      <HowItWorks />
      <FinalCTA />
      <Footer />
    </main>
  );
}
