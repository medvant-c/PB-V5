import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { StatsRow } from "@/components/common/stats-row";
import { TrustLogos } from "@/components/common/trust-logos";
import { PandaCtaBanner } from "@/components/panda/panda-cta-banner";
import { CasesExplorer } from "@/sections/cases/cases-explorer";
import { caseStats } from "@/data/stats";

export const metadata: Metadata = {
  title: "Кейсы — Panda Bridge",
  description: "Реальные истории клиентов Panda Bridge: разные ниши, разные задачи, один результат — рост бизнеса.",
};

export default function CasesPage() {
  return (
    <div className="space-y-12 pb-16">
      <PageHeader
        eyebrow="Кейсы Panda Bridge"
        title="Кейсы"
        description="Реальные истории наших клиентов. Разные ниши, разные задачи, один результат — рост бизнеса."
      />

      <StatsRow stats={caseStats} className="lg:grid-cols-4" />

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <CasesExplorer />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <PandaCtaBanner
            title="Ваш кейс может быть следующим"
            description="Расскажите о своей задаче — и мы предложим лучшее решение для вашего бизнеса с Китаем."
          />
        </div>
      </section>

      <TrustLogos />
    </div>
  );
}
