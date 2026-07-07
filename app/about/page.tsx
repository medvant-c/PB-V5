import type { Metadata } from "next";
import { Globe2, Handshake, Sparkles, Target } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { StatsRow } from "@/components/common/stats-row";
import { PandaCtaBanner } from "@/components/panda/panda-cta-banner";
import { Card } from "@/components/ui/card";
import { ecosystemStats } from "@/data/stats";

export const metadata: Metadata = {
  title: "О компании — Panda Bridge",
  description: "Panda Bridge — операционная система для бизнеса с Китаем: один партнёр, все решения.",
};

const values = [
  {
    icon: Target,
    title: "Наша миссия",
    description: "Сделать работу с Китаем простой, прозрачной и предсказуемой для любого бизнеса.",
  },
  {
    icon: Handshake,
    title: "Прямые контракты",
    description: "Работаем напрямую с проверенными фабриками и поставщиками — без лишних посредников.",
  },
  {
    icon: Sparkles,
    title: "Технологии и AI",
    description: "Автоматизируем рутину и даём клиентам прозрачный контроль на каждом этапе.",
  },
  {
    icon: Globe2,
    title: "Глобальный охват",
    description: "Инфраструктура в Китае, России и СНГ для быстрого и надёжного масштабирования.",
  },
];

export default function AboutPage() {
  return (
    <div className="space-y-12 pb-16">
      <PageHeader
        eyebrow="О компании"
        title="Один мост между вашим бизнесом и Китаем"
        description="Panda Bridge объединяет запуск бизнеса, производство, склад, логистику, обучение и AI в одну экосистему, чтобы вы могли сосредоточиться на росте."
      />

      <section className="px-4 sm:px-6">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((value) => {
            const Icon = value.icon;
            return (
              <Card key={value.title} className="flex flex-col gap-3 p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="text-base font-bold text-text">{value.title}</div>
                <p className="text-sm text-text-secondary">{value.description}</p>
              </Card>
            );
          })}
        </div>
      </section>

      <StatsRow stats={ecosystemStats} />

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <PandaCtaBanner
            title="Хотите узнать больше о Panda Bridge?"
            description="Свяжитесь с нами — расскажем, как экосистема поможет именно вашему бизнесу."
          />
        </div>
      </section>
    </div>
  );
}
