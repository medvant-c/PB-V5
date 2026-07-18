import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Factory, Send } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PandaCtaBanner } from "@/components/panda/panda-cta-banner";
import { SectionHeading } from "@/components/product/section-heading";
import { FeatureChecklist } from "@/components/product/feature-checklist";
import { TimelineSteps } from "@/components/product/timeline-steps";
import { ComparisonBlock } from "@/components/product/comparison-block";
import { EcosystemFlow } from "@/components/product/ecosystem-flow";
import { PricingTable } from "@/components/product/pricing-table";
import { buttonVariants } from "@/components/ui/button";
import { pricing } from "@/data/pricing";

export const metadata: Metadata = {
  title: "Panda Factory — Panda Bridge",
  description:
    "Не просто находим фабрику — создаём ваш бренд вместе с вами. Идея → производство → контроль → доставка → запуск бренда.",
};

const audience = [
  "Производителей, которые хотят перенести производство в Китай",
  "Владельцев брендов, которые хотят выпускать товары под собственной маркой",
  "Селлеров маркетплейсов, которые устали продавать одинаковые товары",
  "Оптовые компании, которым нужны собственные линейки товаров",
  "Стартапы, которые разрабатывают новый продукт",
];

const steps = [
  { title: "Заявка", description: "Клиент описывает задачу и цели проекта." },
  { title: "Анализ задачи", description: "Команда уточняет требования и формат производства." },
  {
    title: "Поиск фабрик",
    description: "Проверяем опыт, лицензии, экспорт, мощности, оборудование, отзывы.",
  },
  {
    title: "Выбор лучших вариантов",
    description: "Сравниваем фабрики и предлагаем оптимальные условия.",
  },
  { title: "Получение образцов", description: "Заказываем и проверяем образцы перед запуском производства." },
  { title: "Тестирование", description: "Проверяем качество, материалы и соответствие образцов задаче." },
  {
    title: "Производство",
    description: "Инспекторы контролируют качество, материалы, количество, упаковку.",
  },
  {
    title: "Контроль качества",
    description: "Финальная инспекция перед отправкой: количество, размеры, упаковка, маркировка.",
  },
  {
    title: "Доставка",
    description: "Склад, консолидация, таможенное оформление, доставка до клиента.",
  },
  {
    title: "Запуск продаж",
    description: "Товар готов к выходу на маркетплейсы под собственным брендом.",
  },
];

const included = [
  "Поиск производителя",
  "Проверка фабрики",
  "Переговоры",
  "OEM",
  "ODM",
  "Разработка продукта",
  "Создание бренда",
  "Контроль производства",
  "Фото- и видеоотчёты",
  "Финальная инспекция",
  "Организация логистики",
];

const additional = [
  "Сертификация (EAC, CE, ISO, FDA, RoHS)",
  "Регистрация товарного знака",
  "Дизайн упаковки",
  "Фото товара",
  "Видео",
  "Контроль загрузки контейнера",
];

const whyUs = [
  "Собственная команда в Китае",
  "Переговоры на китайском языке",
  "Проверенные производители",
  "Контроль качества на каждом этапе",
  "Фото- и видеоотчёты",
  "Полное сопровождение проекта",
  "Работа с OEM и ODM",
  "Разработка собственного бренда",
];

const advantages = [
  "Экономия времени",
  "Снижение рисков",
  "Более выгодные цены от производителей",
  "Контроль качества без поездок в Китай",
  "Возможность создать уникальный продукт",
  "Полный цикл — от идеи до готового товара",
];

const ecosystem = [
  "Panda Start",
  "Panda Business",
  "Panda Factory",
  "Panda Logistics",
  "Panda Fulfillment",
  "Panda AI",
  "Hub OS",
];

export default function FactoryPage() {
  return (
    <div className="space-y-12 pb-16">
      <PageHeader
        eyebrow="Следующий уровень после Panda Start и Panda Business"
        title="Мы не просто находим фабрику. Мы создаём ваш бренд вместе с вами."
        description="Premium-сервис экосистемы Panda Bridge для тех, кто хочет создать собственный продукт или бренд в Китае — а не просто купить готовый товар. Идея → производство → контроль → доставка → запуск бренда."
        actions={
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
              <Factory className="h-7 w-7" />
            </span>
            <Link href="/contacts" className={buttonVariants({ variant: "primary" })}>
              Связаться с нами <Send className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Для кого" title="Panda Factory создан для" />
          <FeatureChecklist items={audience} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <SectionHeading
            eyebrow="Путь клиента"
            title="Как проходит создание бренда с Panda Factory"
            center
          />
          <div className="mt-10">
            <TimelineSteps steps={steps} />
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Полный состав" title="Что входит в Panda Factory" />
          <FeatureChecklist items={included} columns={3} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Выбор формата"
            title="OEM vs ODM — в чём разница"
            description="Два формата производства под ваш бренд."
          />
          <div className="mt-6">
            <ComparisonBlock
              left={{
                title: "OEM — Original Equipment Manufacturer",
                tone: "neutral",
                items: [
                  "Производство готового товара фабрики под вашим брендом и логотипом",
                  "Продукт остаётся таким же, меняется только маркировка",
                  "Быстрее и дешевле запустить",
                ],
              }}
              right={{
                title: "ODM — Original Design Manufacturer",
                tone: "good",
                items: [
                  "Изменение самого товара под вашу задачу: форма, цвет, упаковка, материал",
                  "Подходит, если нужен не просто ваш логотип, а действительно другой продукт",
                  "Больше контроля над уникальностью продукта",
                ],
              }}
            />
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Дополнительно" title="Расширенные опции" />
          <FeatureChecklist items={additional} columns={3} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Почему мы" title="Почему выбирают Panda Factory" />
          <FeatureChecklist items={whyUs} columns={3} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Преимущества" title="Что вы получаете" />
          <FeatureChecklist items={advantages} columns={3} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Экосистема"
            title="Часть большого пути"
            description="Panda Factory помогает перейти от перепродажи готовых товаров к созданию собственного бренда с полным контролем производства."
          />
          <EcosystemFlow items={ecosystem} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Стоимость"
            title="Сколько стоит производство с Panda Factory"
            description="Базовые цены на услуги — ориентир для расчёта бюджета. Точная стоимость зависит от объёма и сложности задачи."
          />
          <div className="mt-6">
            <PricingTable categories={pricing.find((item) => item.id === "factory")!.categories} />
          </div>
          <Link
            href="/pricing"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-all hover:gap-2.5"
          >
            Весь прайс-лист Panda Bridge <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <PandaCtaBanner
            title="Хотите создать собственный бренд?"
            description="Расскажите о своём продукте — мы предложим формат производства (OEM или ODM) и подберём фабрику."
            actions={
              <Link href="/contacts" className={buttonVariants({ variant: "primary" })}>
                Обсудить свой бренд <Send className="h-4 w-4" />
              </Link>
            }
          />
        </div>
      </section>
    </div>
  );
}
