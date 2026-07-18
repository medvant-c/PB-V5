import type { Metadata } from "next";
import { AboutHero } from "@/sections/about/about-hero";
import { IntroText } from "@/sections/about/intro-text";
import { Mission } from "@/sections/about/mission";
import { Vision } from "@/sections/about/vision";
import { UniqueValue } from "@/sections/about/unique-value";
import { EcosystemDiagram } from "@/sections/about/ecosystem-diagram";
import { OurPathTimeline } from "@/sections/about/our-path-timeline";
import { ValuesGlass } from "@/sections/about/values-glass";
import { TrustStats } from "@/sections/about/trust-stats";
import { Team } from "@/sections/about/team";
import { OurApproach } from "@/sections/about/our-approach";
import { BigQuote } from "@/sections/about/big-quote";
import { Future } from "@/sections/about/future";
import { AboutFinalCta } from "@/sections/about/about-final-cta";

export const metadata: Metadata = {
  title: "О компании — Panda Bridge",
  description: "Panda Bridge — экосистема для бизнеса с Китаем: один партнёр, все решения.",
};

export default function AboutPage() {
  return (
    <div>
      <AboutHero />
      <IntroText />
      <Mission />
      <Vision />
      <UniqueValue />
      <EcosystemDiagram />
      <OurPathTimeline />
      <ValuesGlass />
      <TrustStats />
      <Team />
      <OurApproach />
      <BigQuote />
      <Future />
      <AboutFinalCta />
    </div>
  );
}
