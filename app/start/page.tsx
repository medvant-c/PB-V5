import type { Metadata } from "next";
import Link from "next/link";
import { Rocket, Send } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PandaCtaBanner } from "@/components/panda/panda-cta-banner";
import { SectionHeading } from "@/components/product/section-heading";
import { FeatureChecklist } from "@/components/product/feature-checklist";
import { TimelineSteps } from "@/components/product/timeline-steps";
import { EcosystemFlow } from "@/components/product/ecosystem-flow";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Panda Start — Panda Bridge",
  description:
    "Запусти бизнес с Китаем с нуля: от поиска идеи до первых продаж. Все 13 шагов под ключ.",
};

const audience = [
  "Никогда не работал с Китаем и не знает, с чего начать",
  "Хочет открыть бизнес, но не понимает всю цепочку действий",
  "Хочет выйти на Wildberries или Ozon с собственным товаром",
  "Ищет источник дополнительного дохода",
  "Хочет уйти с наёмной работы и начать своё дело",
  "Хочет импортировать товары, но боится ошибиться на любом из этапов",
];

const painPoints = [
  "что продавать",
  "где искать",
  "как проверить спрос",
  "где найти фабрику",
  "как договориться",
  "как заказать",
  "как оплатить",
  "как привезти товар",
  "как пройти таможню",
  "как выйти на Wildberries",
  "как выйти на Ozon",
];

const steps = [
  {
    title: "Поиск идеи",
    description:
      "Определяем бюджет, опыт, интересы и желаемую прибыль. AI и эксперт предлагают варианты бизнеса.",
  },
  {
    title: "Анализ рынка",
    description:
      "Проверяем спрос, конкурентов, сезонность, среднюю цену, маржу и риски. Клиент получает готовый отчёт.",
  },
  {
    title: "Подбор товара",
    description:
      "Ищем несколько вариантов, альтернативы, улучшенные версии и тренды. Не просто товар, а товар, на котором можно заработать.",
  },
  {
    title: "Поиск фабрики",
    description: "Ищем производителей, торговые компании, OEM и ODM. Проверяем лицензии, опыт, качество и экспорт.",
  },
  {
    title: "Переговоры",
    description: "Panda Bridge ведёт переговоры по цене, MOQ, срокам, упаковке и брендированию.",
  },
  {
    title: "Заказ образцов",
    description: "Перед большим заказом проверяем качество, материалы, упаковку и соответствие.",
  },
  {
    title: "Контроль качества (QC)",
    description: "Проверяем товар перед отправкой: фото, видео, отчёт.",
  },
  {
    title: "Производство",
    description: "Контролируем процесс, клиент видит статус производства.",
  },
  {
    title: "Доставка",
    description: "Авиа, авто, море или железная дорога — в зависимости от задачи.",
  },
  {
    title: "Таможня",
    description: "Подготавливаем все необходимые документы.",
  },
  {
    title: "Получение товара",
    description: "Товар приезжает на склад.",
  },
  {
    title: "Выход на маркетплейс",
    description: "Помогаем с карточками, фото, SEO, упаковкой и запуском рекламы.",
  },
  {
    title: "Первые продажи",
    description: "Цель Panda Start не просто доставить товар, а сделать так, чтобы клиент получил первые продажи.",
  },
];

const included = [
  "Поиск идеи",
  "Анализ рынка",
  "Подбор товара",
  "Поиск производителя",
  "Переговоры",
  "Проверка фабрики",
  "Заказ образцов",
  "Контроль качества",
  "Производство",
  "Логистика",
  "Таможня",
  "Маркетплейсы",
  "Поддержка",
];

const hubOsFeatures = [
  "Процент выполнения",
  "Статус",
  "Документы",
  "Фото и видео",
  "Чат с менеджером",
  "Задачи и дедлайны",
];

const aiFuture = [
  "Генерировать идеи товаров",
  "Анализировать рынок",
  "Рассчитывать прибыль",
  "Сравнивать фабрики",
  "Переводить переписку",
  "Искать поставщиков",
  "Прогнозировать продажи",
  "Анализировать риски",
];

const ecosystem = [
  "Panda Start",
  "Panda Business",
  "Panda Factory",
  "Panda Logistics",
  "Panda Fulfillment",
  "Panda Academy",
  "Panda AI",
  "Hub OS",
];

export default function StartPage() {
  return (
    <div className="space-y-12 pb-16">
      <PageHeader
        eyebrow="Запуск бизнеса с Китаем"
        title="Запусти бизнес с Китаем с нуля"
        description="Мы не продаём логистику, поиск товара или контакты фабрик по отдельности. Мы проводим вас за руку от идеи до первых продаж — и берём на себя все 13 шагов на этом пути."
        actions={
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 text-success">
              <Rocket className="h-7 w-7" />
            </span>
            <Link href="/contacts" className={buttonVariants({ variant: "primary" })}>
              Связаться с нами <Send className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Для кого" title="Panda Start создан для тех, кто" />
          <FeatureChecklist items={audience} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Проблема" title="Что происходит без Panda Start" />
          <Card className="mt-6 p-6 sm:p-8">
            <p className="text-sm text-text-secondary">
              Большинство людей начинают с одной мысли: «Я хочу продавать товары». А дальше — хаос.
              Человек не знает:
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {painPoints.map((point) => (
                <span
                  key={point}
                  className="rounded-full bg-black/4 px-3 py-1.5 text-xs font-medium text-text-secondary"
                >
                  {point}
                </span>
              ))}
            </div>
            <p className="mt-5 text-sm font-semibold text-text">
              Panda Start закрывает каждый из этих вопросов — так, что клиенту не нужно разбираться в них самому.
            </p>
          </Card>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Card className="p-6 sm:p-8">
            <SectionHeading
              eyebrow="Идея продукта"
              title="Мы продаём не услуги. Мы продаём результат."
            />
            <p className="mt-4 max-w-2xl text-sm text-text-secondary">
              Результат Panda Start — это ваш первый прибыльный товар из Китая. Не набор разрозненных
              услуг, а один понятный путь с прозрачным прогрессом на каждом шаге.
            </p>
          </Card>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <SectionHeading
            eyebrow="Путь клиента"
            title="Как проходит запуск бизнеса с Panda Start"
            center
          />
          <div className="mt-10">
            <TimelineSteps steps={steps} />
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Полный состав" title="Что входит в направление" />
          <FeatureChecklist items={included} columns={3} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Hub OS"
            title="Прогресс, который видно в реальном времени"
            description="Когда клиент входит в личный кабинет Panda Bridge, он видит дорожную карту своего проекта — от идеи до первых продаж. По каждому этапу доступны:"
          />
          <FeatureChecklist items={hubOsFeatures} columns={3} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="AI внутри Panda Start" title="AI помогает на каждом этапе" />
          <FeatureChecklist items={aiFuture} columns={3} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Экосистема"
            title="Panda Start — только первый шаг"
            description="Дальше клиент может двигаться в любое из направлений экосистемы Panda Bridge."
          />
          <EcosystemFlow items={ecosystem} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <PandaCtaBanner
            title="Хотите обсудить Panda Start?"
            description="Расскажите о своей задаче — мы предложим оптимальное решение и рассчитаем сроки."
          />
        </div>
      </section>
    </div>
  );
}
