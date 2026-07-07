import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { PandaCtaBanner } from "@/components/panda/panda-cta-banner";
import { ScenarioCard } from "@/sections/choose-path/scenario-card";
import { ResultsBanner } from "@/sections/choose-path/results-banner";
import { scenarios } from "@/data/scenarios";

export const metadata: Metadata = {
  title: "Сценарии сотрудничества — Panda Bridge",
  description: "Выберите свою ситуацию — мы возьмём на себя всё остальное.",
};

export default function ScenariosPage() {
  return (
    <div className="space-y-12 pb-16">
      <PageHeader
        eyebrow="Сценарии сотрудничества"
        title="Выберите свой сценарий"
        description="Каждый бизнес уникален. Выберите свою ситуацию — мы возьмём на себя всё остальное."
      />

      <section className="px-4 sm:px-6">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {scenarios.map((scenario) => (
            <ScenarioCard key={scenario.number} scenario={scenario} />
          ))}
        </div>
      </section>

      <ResultsBanner />

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <PandaCtaBanner
            title="Не знаете, с чего начать?"
            description="Расскажите о своей задаче — мы подберём лучший сценарий и предложим оптимальное решение."
          />
        </div>
      </section>
    </div>
  );
}
