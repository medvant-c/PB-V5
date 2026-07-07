import { Monitor } from "lucide-react";
import {
  AcademyIllustration,
  BriefcaseIllustration,
  FactoryIllustration,
  RobotIllustration,
  RocketIllustration,
  TruckIllustration,
  WarehouseIllustration,
} from "@/components/panda/direction-illustrations";
import type { Direction } from "@/types";

export const directions: Direction[] = [
  {
    slug: "start",
    number: "01",
    title: "Panda Start",
    shortTitle: "Start",
    tagline: "Запуск бизнеса с Китаем",
    description:
      "Запустим ваш бизнес с нуля под ключ. Найдём товар, проверим фабрику и организуем первую поставку.",
    icon: RocketIllustration,
    accent: "green",
    features: ["Поиск товара", "Проверка фабрики", "Переговоры", "Первая поставка"],
  },
  {
    slug: "business",
    number: "02",
    title: "Panda Business",
    shortTitle: "Business",
    tagline: "Развитие и масштабирование на маркетплейсах",
    description:
      "Помогаем увеличивать продажи и прибыль. Аналитика, стратегия, оптимизация закупок и управление поставками.",
    icon: BriefcaseIllustration,
    accent: "blue",
    features: ["Аналитика рынка", "Стратегия продаж", "Оптимизация закупок", "Рост прибыли"],
  },
  {
    slug: "factory",
    number: "03",
    title: "Panda Factory",
    shortTitle: "Factory",
    tagline: "Производство под вашим брендом",
    description:
      "Находим и контролируем производство качественного товара под вашим брендом на лучших фабриках.",
    icon: FactoryIllustration,
    accent: "purple",
    features: ["Разработка продукта", "Контроль производства", "Брендирование", "Упаковка и маркировка"],
  },
  {
    slug: "fulfillment",
    number: "04",
    title: "Panda Fulfillment",
    shortTitle: "Fulfillment",
    tagline: "Складские услуги в Китае",
    description:
      "Приёмка, хранение, упаковка и подготовка товаров для маркетплейсов и ваших клиентов.",
    icon: WarehouseIllustration,
    accent: "orange",
    features: ["Приёмка и проверка", "Хранение", "Упаковка и стикеровка", "Фото и видео отчёты"],
  },
  {
    slug: "logistics",
    number: "05",
    title: "Panda Logistics",
    shortTitle: "Logistics",
    tagline: "Доставка грузов из Китая",
    description:
      "Доставим ваш груз морем, авиа или авто. Таможенное оформление и полное сопровождение.",
    icon: TruckIllustration,
    accent: "cyan",
    features: ["Морские перевозки", "Авиа доставка", "Авто доставка", "Таможенное оформление"],
  },
  {
    slug: "academy",
    number: "06",
    title: "Panda Academy",
    shortTitle: "Academy",
    tagline: "Обучение и поддержка",
    description:
      "Практические знания и инструменты для роста бизнеса с Китаем от экспертов-практиков.",
    icon: AcademyIllustration,
    accent: "teal",
    features: ["Онлайн-курсы", "Мастермайнды", "База знаний", "Поддержка сообщества"],
  },
  {
    slug: "ai",
    number: "07",
    title: "Panda AI",
    shortTitle: "AI",
    tagline: "Автоматизация и интеллект",
    description:
      "AI-инструменты и цифровые решения для управления бизнесом на новом уровне эффективности.",
    icon: RobotIllustration,
    accent: "indigo",
    features: ["AI-аналитика", "Автоматизация", "AI-помощник", "Интеграции и API"],
  },
];

export const hubOs: Direction = {
  slug: "hub-os",
  number: "08",
  title: "Hub OS",
  shortTitle: "Hub OS",
  tagline: "Платформа управления бизнесом",
  description: "Единая платформа для управления всеми процессами вашего бизнеса с Китаем.",
  icon: Monitor,
  accent: "blue",
  features: [],
  comingSoon: true,
};

export const accentIconClasses: Record<Direction["accent"], string> = {
  green: "bg-success/10 text-success",
  blue: "bg-primary/10 text-primary",
  purple: "bg-secondary/10 text-secondary",
  orange: "bg-warning/10 text-warning",
  cyan: "bg-cyan-500/10 text-cyan-600",
  teal: "bg-teal-500/10 text-teal-600",
  indigo: "bg-indigo-500/10 text-indigo-600",
};
