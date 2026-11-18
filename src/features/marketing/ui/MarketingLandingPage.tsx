
import "./marketing.css";
import "./responsive-scenes.css";

import BottomCTA from "./BottomCTA";
import ExecutiveQuote from "./ExecutiveQuote";
import FeaturesInfiniteReach from "./FeaturesInfiniteReach";
import FeaturesInstantAds from "./FeaturesInstantAds";
import FeaturesOneTool from "./FeaturesOneTool";
import Footer from "./Footer";
import Hero from "./Hero";
import InteractiveTabs from "./InteractiveTabs";
import Navbar from "./Navbar";
import Pricing from "./Pricing";
import PricingFAQ from "./PricingFAQ";
import ProcessFlow from "./ProcessFlow";
import { ScrollRevealController } from "@/shared/ui/motion/scroll-reveal-controller";
import TestimonialsMasonry from "./TestimonialsMasonry";

export default function MarketingLandingPage() {
  return (
    <main className="marketing-page min-h-screen bg-cosmic-canvas text-white selection:bg-primary selection:text-white">
      <ScrollRevealController />
      <Navbar />


        <div>
          <Hero />
          <div id="feature-surface" className="relative z-20 -mt-12 mx-[3.125vw] rounded-t-[47.7px] rounded-b-[47.7px] border-x border-t border-b border-slate-structure/40 bg-lavender-canvas max-sm:mx-0 max-sm:rounded-none max-sm:border-x-0">
            <FeaturesOneTool />
            <FeaturesInstantAds />
            <FeaturesInfiniteReach />
            <ProcessFlow />
            <ExecutiveQuote />
            <InteractiveTabs />
          </div>
          <Pricing />
          <PricingFAQ />
          <TestimonialsMasonry />
          <BottomCTA />
          <Footer />
        </div>

    </main>
  );
}
