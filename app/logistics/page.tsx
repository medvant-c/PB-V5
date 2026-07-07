import type { Metadata } from "next";
import Link from "next/link";
import { Truck, Send } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PandaCtaBanner } from "@/components/panda/panda-cta-banner";
import { SectionHeading } from "@/components/product/section-heading";
import { FeatureChecklist } from "@/components/product/feature-checklist";
import { EcosystemFlow } from "@/components/product/ecosystem-flow";
import { ShipmentTracker } from "@/components/product/widgets/shipment-tracker";
import { DeliveryCalculator } from "@/components/product/widgets/delivery-calculator";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Panda Logistics — Panda Bridge",
  description: "Ваш груз. Наш контроль. Полный цикл международной логистики из Китая под ключ.",
};

const audience = [
  "Новичков — купили товар впервые и не знают, как отправить, сколько это стоит и какие документы нужны",
  "Селлеров Wildberries и Ozon — нужны постоянные поставки, например контейнер каждые две недели",
  "Брендов — возят большие партии, 20–100 м³ ежемесячно",
  "Производственные компании — везут оборудование, станки, сырьё, комплектующие",
];

const included = [
  "Набор груза от фабрики",
  "Проверка упаковки",
  "Перепаковка",
  "Маркировка для маркетплейсов",
  "Консолидация",
  "Страхование",
  "Таможенное оформление под ключ",
  "Подготовка документов",
  "Отслеживание в реальном времени",
];

const transportTypes = [
  { type: "Морская доставка", note: "Самая выгодная, для больших партий" },
  { type: "Железная дорога", note: "Быстрее моря, часто Китай → Россия" },
  { type: "Авиа", note: "Когда товар нужен срочно" },
  { type: "Авто", note: "Доставка внутри Китая и «последняя миля»" },
  { type: "Сборные грузы (LCL)", note: "Если товара немного, например 3 коробки" },
  { type: "Контейнеры (FCL)", note: "Полный контейнер — 20 футов, 40 футов, 40 HQ" },
];

const geographyMain = ["Россия", "Казахстан", "Беларусь", "Кыргызстан", "Узбекистан"];
const geographyPlans = ["ОАЭ", "Европа", "США"];

const cargoTags = [
  "Электроника",
  "Одежда",
  "Обувь",
  "Мебель",
  "Бытовая техника",
  "Косметика",
  "Товары для дома",
  "Игрушки",
  "Оборудование",
  "Стройматериалы",
];

const additional = [
  "Cargo — безопасная доставка",
  "Белая доставка — полное таможенное оформление",
  "Экспресс — для срочных заказов",
  "VIP — персональный менеджер",
  "Страхование по желанию клиента",
  "Фотоотчёт перед отправкой",
  "Видеоотчёт перед погрузкой",
  "Проверка качества совместно с Panda Factory",
];

const differences = [
  "Единый личный кабинет для всех сервисов",
  "Интеграция с Panda Start, Panda Factory, Panda Fulfillment и Panda Business",
  "Онлайн-отслеживание каждого этапа",
  "Автоматическое хранение всех документов",
  "Аналитика по поставкам и расходам",
  "Персональный менеджер и прозрачная коммуникация",
];

export default function LogisticsPage() {
  return (
    <div className="space-y-12 pb-16">
      <PageHeader
        eyebrow="Panda Logistics"
        title="От фабрики до вашего склада — без лишних вопросов"
        description="Мы превращаем международную логистику из сложного процесса в понятный сервис под ключ. Вам не нужно думать, какой транспорт выбрать, как пройти таможню и где сейчас груз — вы просто знаете: товар едет, Panda контролирует всё."
        actions={
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-600">
              <Truck className="h-7 w-7" />
            </span>
            <Link href="/contacts" className={buttonVariants({ variant: "primary" })}>
              Связаться с нами <Send className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Для кого" title="Panda Logistics подходит для" />
          <FeatureChecklist items={audience} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Что входит" title="Полный цикл — от фабрики до склада" />
          <FeatureChecklist items={included} columns={3} className="mt-6" />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Виды транспорта" title="Какой способ доставки выбрать" />
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {transportTypes.map((item) => (
              <Card key={item.type} className="p-5">
                <div className="text-sm font-bold text-text">{item.type}</div>
                <p className="mt-1 text-sm text-text-secondary">{item.note}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Hub OS"
            title="Прогресс, который видно в реальном времени"
            description="В личном кабинете клиент видит полный статус своего груза: набрали, на складе, проверили, упаковали, отправили, в пути, прибыл — с указанием текущей геолокации и точного количества дней до прибытия."
          />
          <div className="mt-6">
            <ShipmentTracker />
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Калькулятор" title="Узнайте стоимость доставки за секунды" />
          <div className="mt-6">
            <DeliveryCalculator />
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="География" title="Куда мы доставляем" />
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Основные направления
              </div>
              <p className="mt-2 text-sm text-text">{geographyMain.join(", ")}</p>
            </Card>
            <Card className="p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">В планах</div>
              <p className="mt-2 text-sm text-text">{geographyPlans.join(", ")}</p>
            </Card>
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Типы грузов" title="Практически любые товары" />
          <div className="mt-6 flex flex-wrap gap-2">
            {cargoTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-black/4 px-3.5 py-1.5 text-sm font-medium text-text-secondary"
              >
                {tag}
              </span>
            ))}
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
          <SectionHeading
            eyebrow="Экосистема"
            title="Центральное звено цепочки поставок"
            description="Panda Logistics связывает все продукты экосистемы в единый процесс доставки."
          />
          <EcosystemFlow
            items={["Panda Start", "Panda Factory", "Panda Fulfillment", "Panda Logistics", "Panda Business", "Panda AI"]}
            className="mt-6"
          />
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Card className="bg-text p-6 text-white sm:p-8">
            <div className="text-lg font-bold">Не карго-компания, а цифровая платформа</div>
            <p className="mt-2 max-w-2xl text-sm text-white/70">
              В отличие от классических карго-компаний, которые оказывают только транспортные услуги,
              Panda Logistics — часть единой цифровой экосистемы.
            </p>
            <ul className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {differences.map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-white/90">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <PandaCtaBanner
            title="Хотите обсудить доставку?"
            description="Расскажите о своём грузе — мы предложим оптимальный маршрут и рассчитаем стоимость."
          />
        </div>
      </section>
    </div>
  );
}
