import { Hero } from "@/sections/hero/hero";
import { HomeScenarios } from "@/sections/choose-path/home-scenarios";
import { HowItWorks } from "@/sections/how-it-works/how-it-works";
import { StatsRow } from "@/components/common/stats-row";
import { homeStats } from "@/data/stats";

export default function Home() {
  return (
    <>
      <Hero />
      <StatsRow stats={homeStats} className="pb-4" />
      <HomeScenarios />
      <HowItWorks />
    </>
  );
}
