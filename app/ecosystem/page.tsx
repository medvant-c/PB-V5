import type { Metadata } from "next";
import Link from "next/link";
import { Send } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { StatsRow } from "@/components/common/stats-row";
import { PandaCtaBanner } from "@/components/panda/panda-cta-banner";
import { DirectionCard } from "@/sections/ecosystem/direction-card";
import { WhyUs } from "@/sections/ecosystem/why-us";
import { directions } from "@/data/directions";
import { ecosystemStats } from "@/data/stats";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Экосистема решений — Panda Bridge",
  description: "Выберите направление, которое подходит вашему бизнесу с Китаем.",
};

export default function EcosystemPage() {
  return (
    <div className="space-y-12 pb-16">
      <PageHeader
        eyebrow="Экосистема Panda Bridge"
        title="Экосистема решений"
        description="Выберите направление, которое подходит вашему бизнесу, и масштабируйтесь вместе с Panda Bridge."
      />

      <section className="px-4 sm:px-6">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {directions.map((direction) => (
            <DirectionCard key={direction.slug} direction={direction} />
          ))}
        </div>
      </section>

      <WhyUs />

      <StatsRow stats={ecosystemStats} />

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <PandaCtaBanner
            title="Готовы начать?"
            description="Расскажите нам о своей задаче — мы предложим оптимальное решение и рассчитаем стоимость."
            actions={
              <Link href="/contacts" className={buttonVariants({ variant: "primary" })}>
                Подобрать направление <Send className="h-4 w-4" />
              </Link>
            }
          />
        </div>
      </section>
    </div>
  );
}
