import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Send } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PandaCtaBanner } from "@/components/panda/panda-cta-banner";
import { PricingTable } from "@/components/product/pricing-table";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { pricing } from "@/data/pricing";
import { directions, accentIconClasses } from "@/data/directions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Цены — Panda Bridge",
  description:
    "Прайс-лист на услуги Panda Bridge по всем направлениям: запуск бизнеса, масштабирование, производство, логистика, фулфилмент, AI и обучение.",
};

export default function PricingPage() {
  return (
    <div className="space-y-12 pb-16">
      <PageHeader
        eyebrow="Прайс-лист"
        title="Сколько стоят услуги Panda Bridge"
        description="Базовые цены по каждой услуге — ориентир для расчёта бюджета. Итоговая стоимость зависит от объёма и сложности задачи и уточняется на бесплатной консультации."
        actions={
          <Link href="/contacts" className={buttonVariants({ variant: "primary" })}>
            Обсудить свою задачу <Send className="h-4 w-4" />
          </Link>
        }
      />

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap gap-2">
            {pricing.map((product) => {
              const direction = directions.find((item) => item.slug === product.id);
              if (!direction) return null;
              return (
                <a
                  key={product.id}
                  href={`#${product.id}`}
                  className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
                >
                  {direction.title}
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {pricing.map((product) => {
        const direction = directions.find((item) => item.slug === product.id);
        if (!direction) return null;
        const Icon = direction.icon;

        return (
          <section key={product.id} id={product.id} className="scroll-mt-20 px-4 sm:px-6">
            <div className="mx-auto max-w-6xl">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                      accentIconClasses[direction.accent],
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-xl font-extrabold text-text">{direction.title}</div>
                    <p className="text-sm text-text-secondary">{direction.tagline}</p>
                  </div>
                </div>
                <Link
                  href={`/${product.id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-all hover:gap-2.5"
                >
                  Подробнее о {direction.title} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="mt-6">
                <PricingTable categories={product.categories} />
              </div>
            </div>
          </section>
        );
      })}

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Card className="p-6 sm:p-8">
            <p className="text-sm text-text-secondary">
              Все цены указаны в рублях для базовой комплектации услуги и являются ориентировочными.
              Точная стоимость зависит от объёма, сложности задачи и специфики товара — рассчитаем её
              вместе с вами на бесплатной консультации.
            </p>
          </Card>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <PandaCtaBanner
            title="Не нашли нужную услугу или хотите точный расчёт?"
            description="Расскажите о своей задаче — предложим набор услуг и посчитаем итоговую стоимость."
            actions={
              <Link href="/contacts" className={buttonVariants({ variant: "primary" })}>
                Получить расчёт <Send className="h-4 w-4" />
              </Link>
            }
          />
        </div>
      </section>
    </div>
  );
}
