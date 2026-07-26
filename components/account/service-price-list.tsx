"use client";

import { useState } from "react";
import { ChevronDown, Info, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ServiceItem {
  id: string;
  name: string;
  price: string;
  priceNote?: string;
  bullets: string[];
}

interface ServiceGroup {
  title: string;
  icon: typeof Search;
  items: ServiceItem[];
}

// The manager's exact service list/pricing, given once and shown verbatim
// to every client on their own account page — a static reference, not the
// interactive cart below it (that's a different catalog, ServiceCatalogItem
// in the DB). Long "что входит" text is broken into bullets per item —
// scans far faster than one dense paragraph, especially in a narrow sidebar.
const SERVICE_GROUPS: ServiceGroup[] = [
  {
    title: "Поиск товара",
    icon: Search,
    items: [
      {
        id: "standard",
        name: "Standart",
        price: "500 ₽",
        bullets: [
          "Поиск массового товара по фотографии на маркетплейсах Китая (1688, Taobao, Pinduoduo и др.)",
          "Подбор нескольких предложений, сравнение цен",
          "Выбор поставщиков с высоким рейтингом и хорошей репутацией",
        ],
      },
      {
        id: "expert",
        name: "Expert",
        price: "1 000 ₽",
        bullets: [
          "Поиск товара по фотографии с уточнением характеристик",
          "Переговоры с поставщиками по цвету, оттенкам, материалам, размерам и комплектации",
          "Запрос реальных фото и видео товара, проверка соответствия требованиям",
          "Подходит для товаров, которые не являются массовыми и требуют доп. проверки",
        ],
      },
      {
        id: "pro",
        name: "Pro",
        price: "2 000 ₽",
        bullets: [
          "Поиск по примерным фотографиям, эскизам или описанию",
          "Подбор максимально похожих вариантов",
          "Анализ предложений фабрик, изготавливающих продукцию преимущественно под заказ",
          "Подготовка нескольких вариантов для выбора клиентом",
        ],
      },
      {
        id: "pro-production",
        name: "Pro + Организация производства",
        price: "2 000 ₽ + 3 000 ₽",
        bullets: [
          "Для товаров, которых нет в свободной продаже и которые производятся только под заказ",
          "Составление технического задания для фабрики",
          "Поиск и подбор производителя, согласование материалов и размеров",
          "Получение коммерческого предложения",
          "Контроль запуска производства и сопровождение заказа до готовности",
        ],
      },
    ],
  },
  {
    title: "Дополнительные услуги",
    icon: Sparkles,
    items: [
      {
        id: "showroom",
        name: "Посещение шоурумов и магазинов",
        price: "15 000 ₽",
        priceNote: "за день",
        bullets: [
          "Персональный менеджер выезжает в шоурумы, торговые центры и магазины Китая",
          "Поиск подходящих товаров, общение с продавцами и фабриками",
          "Сравнение вариантов",
          "Фото- и видеоотчёт, консультации онлайн при необходимости",
        ],
      },
      {
        id: "procurement",
        name: "Организация закупки товара",
        price: "10%",
        priceNote: "агентское вознаграждение от стоимости товара",
        bullets: [
          "Переговоры с поставщиком, согласование цены и условий",
          "Оформление заказа, контроль оплаты",
          "Контроль качества товара, фото- и видеоотчёт перед отправкой",
          "Организация доставки до склада и подготовка к международной логистике",
        ],
      },
      {
        id: "sample-buyout",
        name: "Выкуп и отправка образцов изделия",
        price: "1 000 ₽",
        priceNote: "за единицу, до 2 образцов",
        bullets: [
          "Выкуп образца изделия у поставщика",
          "Организация отправки образца в ваш адрес",
          "Действует при заказе от 1 до 2 образцов",
        ],
      },
      {
        id: "sample-consolidation",
        name: "Консолидация и отправка образцов на складе",
        price: "3 000 ₽",
        priceNote: "от 3 образцов и более",
        bullets: [
          "Приём и хранение нескольких образцов на складе в Китае",
          "Консолидация всех образцов в одну отправку",
          "Действует при заказе от 3 образцов и более",
        ],
      },
    ],
  },
];

function ServicePriceList() {
  const [openId, setOpenId] = useState<string | null>("standard");

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <h2 className="text-sm font-bold text-text">Услуги и цены</h2>
      <p className="mt-1 text-xs text-text-secondary">Сколько стоит каждый этап работы с нами</p>

      <div className="mt-4 space-y-5">
        {SERVICE_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              <group.icon className="h-3.5 w-3.5" />
              {group.title}
            </div>
            <div className="space-y-1.5">
              {group.items.map((item) => {
                const isOpen = openId === item.id;
                return (
                  <div key={item.id} className="rounded-xl border border-border bg-bg">
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : item.id)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                    >
                      <span className="min-w-0 flex-1 text-sm font-medium text-text">{item.name}</span>
                      <span className="flex shrink-0 items-baseline gap-1">
                        <span className="text-sm font-bold text-primary">{item.price}</span>
                        <ChevronDown
                          className={cn("h-3.5 w-3.5 text-text-secondary transition-transform", isOpen && "rotate-180")}
                        />
                      </span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-border px-3 py-2.5">
                        {item.priceNote && <p className="mb-2 text-xs font-medium text-text-secondary">{item.priceNote}</p>}
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                          Что входит
                        </p>
                        <ul className="space-y-1">
                          {item.bullets.map((bullet, index) => (
                            <li key={index} className="flex gap-1.5 text-xs leading-relaxed text-text-secondary">
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-secondary/50" />
                              {bullet}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-start gap-1.5 rounded-lg bg-bg px-3 py-2 text-[11px] text-text-secondary">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        Цены указаны без НДС. Итоговая стоимость по вашему товару считается индивидуально и отражена в разделе «Мои просчёты».
      </div>
    </div>
  );
}

export { ServicePriceList };
