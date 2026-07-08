import { Hero } from "@/sections/hero/hero";
import { HomeScenarios } from "@/sections/choose-path/home-scenarios";
import { HomeMobilePreviews } from "@/sections/home/home-mobile-previews";
import { HowItWorks } from "@/sections/how-it-works/how-it-works";
import { StatsRow } from "@/components/common/stats-row";
import { homeStats } from "@/data/stats";

export default function Home() {
  return (
    <>
      <Hero />
      <StatsRow stats={homeStats} className="hidden pb-4 md:grid" />
      <HomeScenarios />
      <HomeMobilePreviews />
      <HowItWorks />
    </>
  );
}
