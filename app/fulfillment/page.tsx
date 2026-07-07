import type { Metadata } from "next";
import Link from "next/link";
import { Warehouse, Send } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PandaCtaBanner } from "@/components/panda/panda-cta-banner";
import { SectionHeading } from "@/components/product/section-heading";
import { FeatureChecklist } from "@/components/product/feature-checklist";
import { DetailList } from "@/components/product/detail-list";
import { ComparisonBlock } from "@/components/product/comparison-block";
import { EcosystemFlow } from "@/components/product/ecosystem-flow";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Panda Fulfillment — Panda Bridge",
  description:
    "Полный цикл обработки товара после производства и до отправки на маркетплейс или склад клиента.",
};

const audience = [
  "Продавцов Wildberries",
  "Продавцов Ozon",
  "Продавцов Яндекс Маркет",
  "Оптовые компании",
  "Владельцев собственных брендов",
  "Клиентов Panda Start",
  "Клиентов Panda Business",
  "Клиентов Panda Factory",
];

const included = [
  {
    title: "Приём товара",
    description:
      "После производства товар приезжает на склад Panda в Китае. Проверяются количество, упаковка, качество, повреждения, соответствие заказу.",
  },
  {
    title: "Проверка качества (QC)",
    description:
      "Каждая партия проходит контроль: внешний вид, комплектация, размеры, цвет, работоспособность, наличие брака. Клиент получает фото, видео и отчёт.",
  },
  {
    title: "Консолидация",
    description:
      "Если товар закупается с нескольких фабрик, мы собираем всё на одном складе в одну отправку — это существенно снижает стоимость логистики.",
  },
  {
    title: "Перепаковка",
    description:
      "При необходимости меняем коробки, делаем брендированную упаковку, переклеиваем стикеры, меняем инструкции, добавляем подарки, комплектуем наборы.",
  },
  {
    title: "Маркировка",
    description:
      "Подготавливаем товар под требования маркетплейсов: штрихкоды, QR-коды, артикулы, FNSKU, транспортные этикетки.",
  },
  {
    title: "Комплектация",
    description: "Собираем наборы, подарочные комплекты, акции, бандлы.",
  },
  {
    title: "Хранение",
    description: "Товар может храниться на складе от нескольких дней до нескольких месяцев.",
  },
  {
    title: "Фотоотчёт",
    description: "Клиент видит весь товар, каждую коробку, процесс упаковки и готовые паллеты.",
  },
  {
    title: "Отправка",
    description:
      "После подготовки груз отправляется морем, поездом, автомобилем или самолётом — в Россию, Казахстан, Беларусь, Европу и другие страны.",
  },
];

const additional = [
  "Проверка каждой единицы товара",
  "Проверка случайной выборки",
  "Удаление брака",
  "Замена упаковки",
  "Брендирование",
  "Установка инструкций",
  "Вложение гарантийных талонов",
  "Добавление подарков",
  "Сборка комплектов",
  "Паллетирование",
  "Экспортные документы",
  "Фото- и видеоотчёты",
  "Страхование груза",
];

const advantages = [
  "Один склад для всех поставщиков",
  "Контроль качества на каждом этапе",
  "Экономия на международной логистике",
  "Подготовка товара под требования маркетплейсов",
  "Полная прозрачность процессов",
  "Снижение процента брака и возвратов",
  "Персональный менеджер",
  "Фото- и видеоотчёты в режиме реального времени",
  "Работа с любыми объёмами — от первой партии до контейнерных поставок",
];

export default function FulfillmentPage() {
  return (
    <div className="space-y-12 pb-16">
      <PageHeader
        eyebrow="Panda Fulfillment"
        title="Из Китая — сразу в продажу. Ваш товар готов к Wildberries и Ozon."
        description="Мы полностью берём на себя обработку товара после производства и до отправки на маркетплейс или склад клиента: приём, проверку качества, перепаковку, маркировку и комплектацию."
        actions={
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/10 text-warning">
              <Warehouse className="h-7 w-7" />
            </span>
            <Link href="/contacts" className={buttonVariants({ variant: "primary" })}>
              Связаться с нами <Send className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Для кого" title="Panda Fulfillment подходит для" />
          <FeatureChecklist items={audience} columns={3} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Что меняется"
            title="Что меняется, когда вы подключаете нас"
            center
          />
          <div className="mt-6">
            <ComparisonBlock
              left={{
                title: "До Panda Fulfillment",
                tone: "bad",
                items: [
                  "Товар приходит без проверки",
                  "Разные поставщики — разные отправки",
                  "Ошибки в упаковке",
                  "Отсутствуют фото",
                  "Невозможно проверить количество",
                  "Сложно вернуть брак",
                ],
              }}
              right={{
                title: "После Panda Fulfillment",
                tone: "good",
                items: [
                  "Всё проверено",
                  "Всё сфотографировано",
                  "Всё промаркировано",
                  "Всё перепаковано",
                  "Всё готово к продаже",
                ],
              }}
            />
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Процесс" title="Полный цикл обработки товара" />
          <div className="mt-6">
            <DetailList items={included} />
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
          <SectionHeading eyebrow="Преимущества" title="Почему это работает" />
          <FeatureChecklist items={advantages} columns={3} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Место в экосистеме"
            title="Связующее звено между производством и доставкой"
            description="Если Panda Factory отвечает за создание товара, а Panda Logistics — за его международную перевозку, то Panda Fulfillment обеспечивает, чтобы каждая единица продукции была проверена, правильно упакована, промаркирована и полностью готова к продаже или отправке на склад маркетплейса."
          />
          <EcosystemFlow
            items={["Panda Start", "Panda Factory", "Panda Fulfillment", "Panda Logistics", "Panda Business"]}
            className="mt-6"
          />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <PandaCtaBanner
            title="Хотите передать обработку товара нам?"
            description="Расскажите об объёме и поставщиках — мы предложим схему консолидации и рассчитаем сроки."
          />
        </div>
      </section>
    </div>
  );
}
