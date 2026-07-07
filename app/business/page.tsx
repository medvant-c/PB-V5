import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Send } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PandaCtaBanner } from "@/components/panda/panda-cta-banner";
import { SectionHeading } from "@/components/product/section-heading";
import { FeatureChecklist } from "@/components/product/feature-checklist";
import { DetailList } from "@/components/product/detail-list";
import { EcosystemFlow } from "@/components/product/ecosystem-flow";
import { BusinessDashboard } from "@/components/product/widgets/business-dashboard";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Panda Business — Panda Bridge",
  description:
    "Масштабирование бизнеса с Китаем: превращаем разовые продажи в систему с прозрачным ростом.",
};

const audience = [
  "Продавцов на маркетплейсах",
  "Владельцев интернет-магазинов",
  "Оптовые компании",
  "Бренды",
  "Предпринимателей с оборотом от первых продаж и выше",
];

const painPoints = [
  "Дорогие закупки",
  "Нестабильные поставщики",
  "Плохое качество",
  "Долгие сроки доставки",
  "Кассовые разрывы",
  "Отсутствие системы",
  "Нет собственного бренда",
];

const included = [
  {
    title: "Поиск лучших фабрик",
    description: "Не перекупщиков — именно производителей.",
  },
  {
    title: "Оптимизация закупок",
    description: "Снижение себестоимости товара, переговоры, поиск альтернатив.",
  },
  {
    title: "Контроль производства",
    description: "Фото, видео, инспекция, проверка партии.",
  },
  {
    title: "Логистика",
    description: "Полностью под ключ: Китай → Россия → склад клиента.",
  },
  {
    title: "Fulfillment",
    description: "Если необходимо — товар обрабатывается на нашем складе.",
  },
  {
    title: "Аналитика",
    description: "Анализируем прибыль, спрос, конкурентов, сезонность, перспективные категории.",
  },
  {
    title: "Масштабирование",
    description: "Помогаем выйти на новые товары, новые категории, новые маркетплейсы, новые страны.",
  },
  {
    title: "Персональный менеджер",
    description: "У клиента появляется команда — не нужно самостоятельно искать фабрики, перевозчиков и инспекторов.",
  },
];

const kpi = [
  "Снижение себестоимости",
  "Рост маржинальности",
  "Стабильные поставки",
  "Меньше операционной нагрузки",
  "Увеличение оборота",
  "Возможность масштабирования без хаоса",
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

export default function BusinessPage() {
  return (
    <div className="space-y-12 pb-16">
      <PageHeader
        eyebrow="Panda Business"
        title="Масштабирование бизнеса с Китаем"
        description="Если Panda Start отвечает на вопрос «как начать бизнес с Китаем», то Panda Business отвечает на вопрос «как превратить этот бизнес в систему и масштабировать его». Для предпринимателей, которые уже продают товары и хотят выйти на новый уровень."
        actions={
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Briefcase className="h-7 w-7" />
            </span>
            <Link href="/contacts" className={buttonVariants({ variant: "primary" })}>
              Связаться с нами <Send className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Card className="p-6 sm:p-8">
            <SectionHeading eyebrow="Миссия" title="Наша миссия" />
            <p className="mt-4 max-w-2xl text-sm text-text-secondary">
              Помочь продавцам перестать работать «вслепую» и построить настоящий международный бизнес.
            </p>
          </Card>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Для кого" title="Panda Business подходит для" />
          <FeatureChecklist items={audience} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Проблемы роста" title="Знакомые проблемы роста" />
          <Card className="mt-6 p-6 sm:p-8">
            <div className="flex flex-wrap gap-2">
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
              Panda Business закрывает каждую из этих проблем системно — не разовыми решениями, а перестройкой процессов.
            </p>
          </Card>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Сопровождение" title="Что входит в сопровождение" />
          <div className="mt-6">
            <DetailList items={included} />
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Модули вашего роста"
            title="10 модулей вашего роста"
            description="Дашборд Hub OS с ключевыми метриками и активными модулями сопровождения."
          />
          <div className="mt-6">
            <BusinessDashboard />
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Результаты" title="Что вы увидите после подключения" />
          <FeatureChecklist items={kpi} columns={3} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Место в экосистеме"
            title="От первых продаж к собственному бренду"
            description="Panda Start (первые продажи) → Panda Business (рост оборота) → собственный бренд → Panda Factory."
          />
          <EcosystemFlow items={ecosystem} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <PandaCtaBanner
            title="Готовы масштабировать бизнес?"
            description="Расскажите о своём текущем обороте и целях — мы проведём аудит и предложим план роста."
          />
        </div>
      </section>
    </div>
  );
}
