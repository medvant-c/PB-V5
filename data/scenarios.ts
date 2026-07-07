import { Bot, Factory, Rocket, TrendingUp, Truck, Warehouse } from "lucide-react";
import type { Scenario } from "@/types";

export const scenarios: Scenario[] = [
  {
    number: "01",
    title: "Я хочу начать бизнес с Китаем",
    description: "Найдём товар, проверим фабрику, организуем поставку и доставку.",
    icon: Rocket,
    accent: "green",
    features: ["Поиск товара", "Проверка фабрики", "Первая поставка", "Доставка под ключ"],
    href: "/start",
  },
  {
    number: "02",
    title: "У меня уже есть продажи",
    description: "Поможем масштабировать бизнес, улучшить процессы и снизить издержки.",
    icon: TrendingUp,
    accent: "blue",
    features: ["Аналитика и стратегия", "Оптимизация закупок", "Снижение издержек", "Рост прибыли"],
    href: "/business",
  },
  {
    number: "03",
    title: "Хочу выпускать товар под своим брендом",
    description: "Разработаем продукт и запустим производство под вашим брендом.",
    icon: Factory,
    accent: "purple",
    features: ["Разработка продукта", "Поиск и проверка фабрик", "Контроль производства", "Брендирование и упаковка"],
    href: "/factory",
  },
  {
    number: "04",
    title: "Нужен склад в Китае",
    description: "Приёмка, хранение, упаковка и отправка товаров на маркетплейсы или клиентам.",
    icon: Warehouse,
    accent: "orange",
    features: ["Приёмка и проверка", "Хранение товаров", "Упаковка и стикеровка", "Отправка по миру"],
    href: "/fulfillment",
  },
  {
    number: "05",
    title: "Нужно доставить груз",
    description: "Морские, авиа и авто перевозки из Китая в любую точку мира. Таможенное оформление.",
    icon: Truck,
    accent: "cyan",
    features: ["Морские перевозки", "Авиа доставка", "Авто доставка", "Таможенное оформление"],
    href: "/logistics",
  },
  {
    number: "06",
    title: "Хочу автоматизировать процессы",
    description: "AI-решения и цифровые инструменты для управления бизнесом с Китаем на новом уровне.",
    icon: Bot,
    accent: "indigo",
    features: ["AI-аналитика", "Автоматизация", "AI-помощник", "Интеграции и API"],
    href: "/ai",
  },
];
