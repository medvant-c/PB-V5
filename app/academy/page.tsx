import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, Send } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PandaCtaBanner } from "@/components/panda/panda-cta-banner";
import { SectionHeading } from "@/components/product/section-heading";
import { FeatureChecklist } from "@/components/product/feature-checklist";
import { EcosystemFlow } from "@/components/product/ecosystem-flow";
import { AcademyProgress } from "@/components/product/widgets/academy-progress";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Panda Academy — Panda Bridge",
  description: "Крупнейшая русскоязычная школа по работе с Китаем. От новичка до предпринимателя.",
};

const audience = [
  "Новичков — никогда не работали с Китаем, изучают как искать товар, выбирать нишу, заказывать первую партию и избегать мошенников",
  "Продавцов маркетплейсов (Wildberries, Ozon, Amazon, Kaspi) — хотят снижать себестоимость, искать производителей, создавать собственные бренды, работать напрямую без посредников",
  "Предпринимателей — компании, которые хотят выпускать продукцию под своим брендом",
  "Импортёров — компаниям, которым нужно регулярно закупать товар в Китае",
  "Стартапов — тех, кто хочет создать новый продукт",
];

const formats = [
  "Видеокурсы — пошаговые уроки",
  "Прямые эфиры — ответы на вопросы",
  "Онлайн-разборы — разбор бизнеса учеников",
  "Практические задания — после каждого урока",
  "Домашние задания — с проверкой",
  "Чек-листы — проверка поставщика, фабрики, документов",
  "Шаблоны — договоры, инвойсы, технические задания, сообщения поставщикам",
];

const aiExamples = [
  "«Найди завод по производству детских игрушек»",
  "«Переведи сообщение поставщику»",
  "«Проверь контракт»",
];

const certification = [
  "Сертификат Panda Academy",
  "Рейтинг ученика",
  "Значки достижений",
  "Электронный диплом",
];

const nextSteps = [
  "Panda Start — запуск первой закупки",
  "Panda Factory — создание собственного производства и бренда",
  "Panda Logistics — организация доставки",
  "Panda Fulfillment — хранение и обработка товаров",
  "Panda Business — масштабирование компании",
];

const ecosystem = [
  "Panda Start",
  "Panda Business",
  "Panda Factory",
  "Panda Logistics",
  "Panda Fulfillment",
  "Panda Academy",
  "Panda AI",
];

export default function AcademyPage() {
  return (
    <div className="space-y-12 pb-16">
      <PageHeader
        eyebrow="Panda Academy"
        title="Освой Китай. Построй глобальный бизнес"
        description="Мы превращаем человека, который никогда не работал с Китаем, в предпринимателя, способного самостоятельно запускать и масштабировать бизнес с Китаем. Путь: не знал ничего → запустил продажи → создал бренд → открыл компанию в Китае → масштабировал бизнес."
        actions={
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-600">
              <GraduationCap className="h-7 w-7" />
            </span>
            <Link href="/contacts" className={buttonVariants({ variant: "primary" })}>
              Начать обучение <Send className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Место в экосистеме"
            title="Обучение всей экосистеме Panda Bridge"
          />
          <EcosystemFlow items={ecosystem} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Для кого" title="Panda Academy подходит для" />
          <FeatureChecklist items={audience} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Программа обучения"
            title="10 модулей — чему вы научитесь"
            description="Основы работы с Китаем, поиск товара, площадки (Alibaba, 1688, Made-in-China, Poizon, Taobao, WeChat), переговоры, контроль качества, логистика, документы, маркетплейсы, собственный бренд, масштабирование."
          />
          <div className="mt-6">
            <AcademyProgress />
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Форматы" title="Как устроено обучение" />
          <FeatureChecklist items={formats} columns={3} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Card className="p-6 sm:p-8">
            <SectionHeading eyebrow="AI-помощник" title="Учитесь с Panda AI" />
            <p className="mt-4 max-w-2xl text-sm text-text-secondary">
              Интеграция с Panda AI позволяет ученику сразу применять знания. Можно спросить:
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {aiExamples.map((example) => (
                <span
                  key={example}
                  className="rounded-full bg-black/4 px-3.5 py-1.5 text-sm text-text-secondary"
                >
                  {example}
                </span>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Сертификация" title="Что вы получите по окончании" />
          <FeatureChecklist items={certification} columns={3} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Card className="p-6 sm:p-8">
            <SectionHeading eyebrow="Сообщество" title="Закрытый клуб предпринимателей" />
            <p className="mt-4 max-w-2xl text-sm text-text-secondary">
              Внутри сообщества — предприниматели, поставщики, эксперты, логисты и маркетологи.
              Пространство для нетворкинга, обмена опытом и поиска партнёров.
            </p>
          </Card>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Что дальше"
            title="Знания сразу становятся практикой"
            description="После обучения ученик переходит в другие сервисы экосистемы."
          />
          <FeatureChecklist items={nextSteps} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <PandaCtaBanner
            title="Готовы начать обучение?"
            description="Выберите свой уровень — с нуля или для действующих продавцов — и начните путь к собственному бизнесу с Китаем."
            actions={
              <Link href="/contacts" className={buttonVariants({ variant: "primary" })}>
                Начать обучение <Send className="h-4 w-4" />
              </Link>
            }
          />
        </div>
      </section>
    </div>
  );
}
