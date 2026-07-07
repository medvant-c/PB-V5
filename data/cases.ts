import { Clock, DollarSign, Package, TrendingUp, Weight } from "lucide-react";
import type { CaseStudy } from "@/types";

export const caseCategories = ["Все кейсы", "Start", "Business", "Factory", "Fulfillment", "Logistics", "Другие ниши"] as const;

export const cases: CaseStudy[] = [
  {
    slug: "kids-clothing-brand",
    category: "Factory",
    niche: "Детская одежда",
    title: "Детская одежда под брендом клиента",
    description:
      "Разработали коллекцию, нашли надежную фабрику, проконтролировали производство и доставили товар на склад клиента в Россию.",
    metrics: [
      { icon: Clock, value: "45 дней", label: "от идеи до первой поставки" },
      { icon: DollarSign, value: "3 200 000 ₽", label: "выручка в первый месяц продаж" },
      { icon: TrendingUp, value: "210%", label: "рост прибыли за 3 месяца" },
    ],
    gradient: "from-rose-200 to-amber-100",
  },
  {
    slug: "marketplace-scaling",
    category: "Business",
    niche: "Аксессуары",
    title: "Масштабирование продаж на маркетплейсах",
    description:
      "Оптимизировали поставки, улучшили юнит-экономику и вывели карточки в топ на Wildberries и Ozon.",
    metrics: [
      { icon: Clock, value: "2 месяца", label: "вывели в топ" },
      { icon: DollarSign, value: "7 800 000 ₽", label: "выручка в месяц" },
      { icon: TrendingUp, value: "178%", label: "рост продаж" },
    ],
    gradient: "from-slate-300 to-slate-100",
  },
  {
    slug: "electronics-delivery",
    category: "Logistics",
    niche: "Электроника",
    title: "Доставка электроники «под ключ»",
    description:
      "Организовали выкуп, проверку, упаковку и доставку партии электроники из Китая в Россию.",
    metrics: [
      { icon: Clock, value: "18 дней", label: "доставка до склада" },
      { icon: Weight, value: "1 200 кг", label: "вес партии" },
      { icon: TrendingUp, value: "30%", label: "экономия на логистике" },
    ],
    gradient: "from-sky-300 to-blue-100",
  },
  {
    slug: "home-goods-launch",
    category: "Start",
    niche: "Товары для дома",
    title: "Первая поставка с нуля за 30 дней",
    description:
      "Помогли выбрать нишу, нашли проверенную фабрику и организовали первую тестовую партию товара.",
    metrics: [
      { icon: Clock, value: "30 дней", label: "от заявки до склада" },
      { icon: Package, value: "500 ед.", label: "первая партия" },
      { icon: TrendingUp, value: "150%", label: "рост за квартал" },
    ],
    gradient: "from-emerald-200 to-teal-100",
  },
  {
    slug: "cosmetics-fulfillment",
    category: "Fulfillment",
    niche: "Косметика",
    title: "Складская логистика для бренда косметики",
    description:
      "Организовали приёмку, хранение и упаковку товаров для отгрузок на маркетплейсы напрямую из Китая.",
    metrics: [
      { icon: Clock, value: "24 часа", label: "обработка заказа" },
      { icon: Package, value: "12 000 ед.", label: "на складе" },
      { icon: TrendingUp, value: "40%", label: "снижение издержек" },
    ],
    gradient: "from-violet-200 to-purple-100",
  },
  {
    slug: "sports-brand-launch",
    category: "Другие ниши",
    niche: "Спортивные товары",
    title: "Вывод бренда спортивных товаров на рынок",
    description:
      "Полный цикл от разработки продукта до запуска продаж: производство, брендирование и логистика.",
    metrics: [
      { icon: Clock, value: "60 дней", label: "запуск бренда" },
      { icon: DollarSign, value: "5 400 000 ₽", label: "выручка за квартал" },
      { icon: TrendingUp, value: "220%", label: "рост продаж" },
    ],
    gradient: "from-orange-200 to-amber-100",
  },
];
