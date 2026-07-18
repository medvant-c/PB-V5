import type { Metadata } from "next";
import Link from "next/link";
import { Send } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { StatsRow } from "@/components/common/stats-row";
import { TrustLogos } from "@/components/common/trust-logos";
import { PandaCtaBanner } from "@/components/panda/panda-cta-banner";
import { ReviewsCarousel } from "@/sections/reviews/reviews-carousel";
import { reviews } from "@/data/reviews";
import { reviewStats } from "@/data/stats";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Отзывы клиентов — Panda Bridge",
  description: "Мы гордимся результатами наших клиентов. Вот что они говорят о работе с Panda Bridge.",
};

export default function ReviewsPage() {
  return (
    <div className="space-y-12 pb-16">
      <PageHeader
        eyebrow="Отзывы клиентов"
        title="Нам доверяют"
        description="Мы гордимся результатами наших клиентов. Вот что они говорят о работе с Panda Bridge."
      />

      <StatsRow stats={reviewStats} className="lg:grid-cols-4" />

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <ReviewsCarousel reviews={reviews} />
        </div>
      </section>

      <TrustLogos />

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <PandaCtaBanner
            title="Ваш успех — наша репутация"
            description="Присоединяйтесь к тысячам предпринимателей, которые уже масштабируют свой бизнес с Китаем."
            actions={
              <Link href="/contacts" className={buttonVariants({ variant: "primary" })}>
                Начать сотрудничество <Send className="h-4 w-4" />
              </Link>
            }
          />
        </div>
      </section>
    </div>
  );
}
