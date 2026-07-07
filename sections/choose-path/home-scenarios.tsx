import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { scenarios } from "@/data/scenarios";
import { ScenarioCard } from "@/sections/choose-path/scenario-card";
import { Eyebrow } from "@/components/ui/eyebrow";

function HomeScenarios() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <Eyebrow className="justify-center">Сценарии</Eyebrow>
          <h2 className="mt-3 text-3xl font-extrabold text-text sm:text-4xl">Выберите свой сценарий</h2>
          <p className="mx-auto mt-3 max-w-2xl text-base text-text-secondary">
            Каждый бизнес уникален. Выберите свою ситуацию — мы возьмём на себя всё остальное.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {scenarios.map((scenario) => (
            <ScenarioCard key={scenario.number} scenario={scenario} />
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/scenarios"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-all hover:gap-2.5"
          >
            Смотреть все сценарии <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export { HomeScenarios };
