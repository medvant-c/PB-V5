import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PandaCtaBanner } from "@/components/panda/panda-cta-banner";
import { Card } from "@/components/ui/card";
import { accentIconClasses, directions, hubOs } from "@/data/directions";

const allDirections = [...directions, hubOs];

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return [{ slug: hubOs.slug }];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const direction = allDirections.find((d) => d.slug === slug);
  if (!direction) return {};

  return {
    title: `${direction.title} — Panda Bridge`,
    description: direction.tagline,
  };
}

export default async function DirectionPage({ params }: PageProps) {
  const { slug } = await params;
  const direction = allDirections.find((d) => d.slug === slug);

  if (!direction) {
    notFound();
  }

  const Icon = direction.icon;

  return (
    <div className="space-y-12 pb-16">
      <PageHeader
        eyebrow={direction.tagline}
        title={direction.title}
        description={direction.description}
        actions={
          <span
            className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl ${accentIconClasses[direction.accent]}`}
          >
            <Icon className="h-7 w-7" />
          </span>
        }
      />

      {direction.comingSoon ? (
        <section className="px-4 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <Card className="p-8 text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">Скоро</p>
              <h2 className="mt-2 text-2xl font-extrabold text-text">Hub OS уже в разработке</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-text-secondary">
                Единая платформа для управления всеми процессами вашего бизнеса с Китаем. Оставьте
                заявку, и мы сообщим вам первыми о запуске.
              </p>
            </Card>
          </div>
        </section>
      ) : (
        <section className="px-4 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <Card className="p-8">
              <h2 className="text-lg font-bold text-text">Что входит в направление</h2>
              <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {direction.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5 text-sm text-text">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                    {feature}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </section>
      )}

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <PandaCtaBanner
            title={`Хотите обсудить ${direction.title}?`}
            description="Расскажите о своей задаче — мы предложим оптимальное решение и рассчитаем сроки."
          />
        </div>
      </section>
    </div>
  );
}
