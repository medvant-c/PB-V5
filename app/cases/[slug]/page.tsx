import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PandaCtaBanner } from "@/components/panda/panda-cta-banner";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cases } from "@/data/cases";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return cases.map((caseStudy) => ({ slug: caseStudy.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const caseStudy = cases.find((c) => c.slug === slug);
  if (!caseStudy) return {};

  return {
    title: `${caseStudy.title} — Panda Bridge`,
    description: caseStudy.description,
  };
}

export default async function CaseDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const caseStudy = cases.find((c) => c.slug === slug);

  if (!caseStudy) {
    notFound();
  }

  return (
    <div className="space-y-10 pb-16">
      <div className="px-4 pt-6 sm:px-6">
        <Link
          href="/cases"
          className="mx-auto flex max-w-6xl items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" /> Все кейсы
        </Link>
      </div>

      <PageHeader
        eyebrow={`${caseStudy.category} · Ниша: ${caseStudy.niche}`}
        title={caseStudy.title}
        description={caseStudy.description}
      />

      <section className="px-4 sm:px-6">
        <div className={cn("mx-auto h-56 max-w-6xl rounded-3xl bg-gradient-to-br", caseStudy.gradient)} />
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-3">
          {caseStudy.metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <Card key={metric.label} className="p-6 text-center">
                <Icon className="mx-auto h-6 w-6 text-primary" />
                <div className="mt-3 text-2xl font-bold text-text">{metric.value}</div>
                <div className="mt-1 text-sm text-text-secondary">{metric.label}</div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <PandaCtaBanner
            title="Хотите похожий результат?"
            description="Расскажите о своей задаче — мы предложим решение под ваш бизнес и рассчитаем сроки."
            actions={
              <Link href="/contacts" className={buttonVariants({ variant: "primary" })}>
                Хочу такой же результат <Send className="h-4 w-4" />
              </Link>
            }
          />
        </div>
      </section>
    </div>
  );
}
