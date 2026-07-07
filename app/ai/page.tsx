import type { Metadata } from "next";
import Link from "next/link";
import { Bot, Send } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PandaCtaBanner } from "@/components/panda/panda-cta-banner";
import { SectionHeading } from "@/components/product/section-heading";
import { FeatureChecklist } from "@/components/product/feature-checklist";
import { DetailList } from "@/components/product/detail-list";
import { EcosystemFlow } from "@/components/product/ecosystem-flow";
import { AiChatDemo } from "@/components/product/widgets/ai-chat-demo";
import { PandaAiChat } from "@/components/panda/panda-ai-chat";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Panda AI — Panda Bridge",
  description: "Искусственный интеллект для бизнеса с Китаем, который знает ваш бизнес и умеет работать.",
};

const tasks = [
  {
    title: "Поиск товара",
    description:
      "Запрос «Найди товар до 300 рублей закупки» — AI показывает прибыль, объём рынка, сезонность, конкурентов, рейтинг.",
  },
  {
    title: "Анализ товара",
    description: "Например «Детский проектор» — AI показывает спрос, тренд, число продавцов, риск, рекомендуемые цены.",
  },
  {
    title: "Поиск фабрики",
    description: "AI автоматически ищет производителей, проверяет рейтинг, MOQ, экспортный опыт, сертификаты.",
  },
  {
    title: "Проверка фабрики",
    description: "AI отвечает конкретно: сколько лет работает завод, в какие страны экспортирует, какие сертификаты есть, проводился ли аудит.",
  },
  {
    title: "Логистика",
    description: "Запрос «Мне нужно привезти 4 куба в Москву» — AI рассчитывает стоимость, сроки, варианты доставки, лучший маршрут.",
  },
  {
    title: "Работа с документами",
    description: "Можно загрузить invoice, packing list, контракт, сертификат — AI проверит ошибки.",
  },
  {
    title: "Контроль заказа",
    description: "AI знает весь путь: фабрика → производство → QC → отгрузка → порт → корабль → таможня → склад → клиент — и показывает статус.",
  },
  {
    title: "Маркетплейсы",
    description: "AI знает WB, Ozon, Amazon, Kaspi и может ответить: «Почему упали продажи?» или «Что изменить в карточке?»",
  },
  {
    title: "Аналитика",
    description: "Каждый день AI строит отчёты: прибыль, расходы, остатки, логистика, маржинальность.",
  },
  {
    title: "Финансовый помощник",
    description: "Запрос «Сколько денег мне нужно, чтобы выйти на оборот 10 млн?» — AI строит финансовую модель.",
  },
  {
    title: "Бизнес-консультант",
    description: "Запрос «Стоит ли сейчас запускать этот товар?» — AI объясняет риски, конкурентов, прибыль.",
  },
];

const generate = [
  "Договоры",
  "Коммерческие предложения",
  "Презентации",
  "Карточки товара",
  "Описания и SEO",
  "Инструкции",
  "Рекламу",
  "Письма фабрикам",
  "Ответы клиентам",
];

const audience = [
  "Начинающего предпринимателя — пошагово помогает начать бизнес",
  "Опытной компании — помогает искать производителей",
  "Производителя — создаёт собственный бренд",
  "Marketplace-продавца — управляет продажами",
  "Логистической компании — контролирует перевозки",
];

const advantages = [
  "Контекст бизнеса — помнит ваши товары, поставщиков, склады, историю заказов и продажи",
  "Доступ ко всем данным HUB OS — анализирует CRM, финансы, склад, логистику и документы в одном месте",
  "Автоматизация действий — не только советует, но и запускает процессы: создаёт задачи, формирует документы, отправляет запросы поставщикам",
  "Обучение на истории компании — рекомендации становятся точнее со временем",
  "Единая точка управления — пользователь обращается обычным языком, AI координирует работу всех модулей",
];

const roadmap = [
  {
    version: "Версия 1.0",
    items: ["AI-чат внутри HUB OS", "Ответы на вопросы по бизнесу", "Генерация документов и писем", "Анализ товаров и поставщиков"],
  },
  {
    version: "Версия 2.0",
    items: ["Автоматический анализ продаж и остатков", "Финансовые прогнозы", "Голосовой помощник", "AI-рекомендации по закупкам и логистике"],
  },
  {
    version: "Версия 3.0",
    items: [
      "Полноценный AI-агент, самостоятельно выполняющий цепочки задач: ищет фабрики, сравнивает предложения, готовит документы, контролирует производство и информирует владельца только о ключевых решениях",
    ],
  },
];

export default function AiPage() {
  return (
    <div className="space-y-12 pb-16">
      <PageHeader
        eyebrow="Panda AI"
        title="От идеи до результата — с помощью AI"
        description="Большинство AI умеют отвечать. Panda AI умеет работать. Он знает товары, поставщиков, логистику, маркетплейсы, документы, склады, продажи и клиентов — и помогает принимать решения вместо того, чтобы просто отвечать на вопросы."
        actions={
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600">
              <Bot className="h-7 w-7" />
            </span>
            <Link href="/contacts" className={buttonVariants({ variant: "primary" })}>
              Связаться с нами <Send className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Как это работает на практике"
            title="Попробуйте демо-диалог"
            description="Выберите готовый запрос — и посмотрите, как Panda AI отвечает."
          />
          <div className="mt-6">
            <AiChatDemo />
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Живой чат"
            title="Попробуйте Panda AI прямо сейчас"
            description="Настоящий диалог с Panda AI — задайте свой вопрос о бизнесе с Китаем."
          />
          <div className="mt-6">
            <PandaAiChat />
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Место в экосистеме" title="AI знает всё о каждом модуле" />
          <EcosystemFlow
            items={[
              "Panda Start",
              "Panda Business",
              "Panda Factory",
              "Panda Logistics",
              "Panda Fulfillment",
              "Panda AI",
              "Hub OS",
            ]}
            className="mt-6"
          />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Возможности" title="Что умеет Panda AI" />
          <div className="mt-6">
            <DetailList items={tasks} />
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Card className="p-6 sm:p-8">
            <SectionHeading eyebrow="Персональный AI-менеджер" title="Знает именно ваш бизнес" />
            <p className="mt-4 max-w-2xl text-sm text-text-secondary">
              После регистрации AI знает ваш бизнес, товары, оборот, клиентов и поставщиков — поэтому
              отвечает максимально персонально.
            </p>
            <p className="mt-4 max-w-xl rounded-2xl bg-black/3 px-4 py-3 text-sm italic text-text">
              «Антон, по прошлой поставке было 7% брака. Для новой партии рекомендую провести инспекцию
              перед отгрузкой.»
            </p>
          </Card>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Card className="p-6 sm:p-8">
            <SectionHeading eyebrow="Работа внутри Hub OS" title="AI встроен в каждую страницу" />
            <p className="mt-4 max-w-xl rounded-2xl bg-black/3 px-4 py-3 text-sm italic text-text">
              «Сегодня: оборот вырос на 18%. На складе заканчиваются коробки. 3 поставки задерживаются.
              Рекомендую заказать новую партию через 5 дней.»
            </p>
          </Card>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Генерация" title="AI как ваш исполнитель" />
          <FeatureChecklist items={generate} columns={3} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Для кого" title="Panda AI подходит для" />
          <FeatureChecklist items={audience} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Уникальные преимущества"
            title="Чем Panda AI отличается от обычных чат-ботов"
            description="В отличие от универсальных ИИ, Panda AI работает с контекстом бизнеса пользователя — это операционная система для принятия решений, а не просто собеседник."
          />
          <FeatureChecklist items={advantages} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Roadmap" title="Куда движется продукт" />
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {roadmap.map((stage) => (
              <Card key={stage.version} className="p-5">
                <div className="text-sm font-bold text-primary">{stage.version}</div>
                <ul className="mt-3 space-y-2">
                  {stage.items.map((item) => (
                    <li key={item} className="text-sm text-text-secondary">
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <PandaCtaBanner
            title="Хотите вести бизнес через диалог с AI?"
            description="Расскажите о своей задаче — покажем, как Panda AI применяется именно к вашему бизнесу."
          />
        </div>
      </section>
    </div>
  );
}
