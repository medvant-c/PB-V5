import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import { cases } from "@/data/cases";
import { reviews } from "@/data/reviews";
import { contactChannels } from "@/data/contacts";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { buttonVariants } from "@/components/ui/button";

function SeeMoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-all hover:gap-2.5"
    >
      {children} <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function CasesPreview() {
  const preview = cases.slice(0, 2);

  return (
    <section className="px-4 py-10 sm:px-6 md:hidden">
      <Eyebrow>Кейсы</Eyebrow>
      <h2 className="mt-3 text-2xl font-extrabold text-text">Результаты клиентов</h2>

      <div className="mt-5 flex flex-col gap-3">
        {preview.map((caseStudy) => (
          <Link key={caseStudy.slug} href={`/cases/${caseStudy.slug}`}>
            <Card className="p-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                {caseStudy.niche}
              </span>
              <div className="mt-1 text-base font-bold text-text">{caseStudy.title}</div>
              <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{caseStudy.description}</p>
            </Card>
          </Link>
        ))}
      </div>

      <SeeMoreLink href="/cases">Смотреть все кейсы</SeeMoreLink>
    </section>
  );
}

function ReviewsPreview() {
  const preview = reviews.slice(0, 2);

  return (
    <section className="px-4 py-10 sm:px-6 md:hidden">
      <Eyebrow>Отзывы</Eyebrow>
      <h2 className="mt-3 text-2xl font-extrabold text-text">Что говорят клиенты</h2>

      <div className="mt-5 flex flex-col gap-3">
        {preview.map((review) => (
          <Card key={review.name} className="p-4">
            <div className="flex items-center gap-1">
              {Array.from({ length: review.rating }).map((_, i) => (
                <Star key={i} className="h-3.5 w-3.5 fill-warning text-warning" />
              ))}
            </div>
            <p className="mt-2 line-clamp-3 text-sm text-text-secondary">«{review.quote}»</p>
            <div className="mt-2 text-sm font-bold text-text">{review.name}</div>
            <div className="text-xs text-text-secondary">{review.role}</div>
          </Card>
        ))}
      </div>

      <SeeMoreLink href="/reviews">Все отзывы</SeeMoreLink>
    </section>
  );
}

function AboutPreview() {
  return (
    <section className="px-4 py-10 sm:px-6 md:hidden">
      <Eyebrow>О компании</Eyebrow>
      <h2 className="mt-3 text-2xl font-extrabold text-text">Один мост между вашим бизнесом и Китаем</h2>
      <p className="mt-3 text-sm text-text-secondary">
        Panda Bridge объединяет запуск бизнеса, производство, склад, логистику, обучение и AI в одну
        экосистему, чтобы вы могли сосредоточиться на росте.
      </p>

      <SeeMoreLink href="/about">Подробнее о компании</SeeMoreLink>
    </section>
  );
}

function ContactsPreview() {
  return (
    <section className="px-4 py-10 sm:px-6 md:hidden">
      <Eyebrow>Контакты</Eyebrow>
      <h2 className="mt-3 text-2xl font-extrabold text-text">Свяжитесь с нами</h2>

      <div className="mt-5 flex flex-col gap-2">
        {contactChannels.map((channel) => {
          const Icon = channel.icon;
          const row = (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-text">{channel.label}</div>
                <div className="truncate text-xs text-text-secondary">{channel.value}</div>
              </div>
            </div>
          );

          if (!channel.href) {
            return <div key={channel.label}>{row}</div>;
          }

          return (
            <a
              key={channel.label}
              href={channel.href}
              target={channel.href.startsWith("http") ? "_blank" : undefined}
              rel={channel.href.startsWith("http") ? "noopener noreferrer" : undefined}
            >
              {row}
            </a>
          );
        })}
      </div>

      <Link href="/contacts" className={buttonVariants({ variant: "primary", size: "lg", className: "mt-5 w-full" })}>
        Написать нам
      </Link>
    </section>
  );
}

function HomeMobilePreviews() {
  return (
    <>
      <CasesPreview />
      <ReviewsPreview />
      <AboutPreview />
      <ContactsPreview />
    </>
  );
}

export { HomeMobilePreviews };
