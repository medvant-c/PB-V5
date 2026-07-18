import {
  FolderKanban,
  Home,
  MessageSquare,
  Monitor,
  Network,
  Phone,
  Tag,
  UserRound,
  Waypoints,
} from "lucide-react";
import {
  AcademyIllustration,
  BriefcaseIllustration,
  FactoryIllustration,
  RobotIllustration,
  RocketIllustration,
  TruckIllustration,
  WarehouseIllustration,
} from "@/components/panda/direction-illustrations";
import type { NavItem } from "@/types";

export const mainNav: NavItem[] = [
  { label: "Главная", href: "/", icon: Home },
  { label: "Экосистема", href: "/ecosystem", icon: Network },
  { label: "Сценарии", href: "/scenarios", icon: Waypoints },
];

export const directionsNav: NavItem[] = [
  { label: "Start", href: "/start", icon: RocketIllustration },
  { label: "Business", href: "/business", icon: BriefcaseIllustration },
  { label: "Factory", href: "/factory", icon: FactoryIllustration },
  { label: "Fulfillment", href: "/fulfillment", icon: WarehouseIllustration },
  { label: "Logistics", href: "/logistics", icon: TruckIllustration },
  { label: "Academy", href: "/academy", icon: AcademyIllustration },
  { label: "AI", href: "/ai", icon: RobotIllustration },
  { label: "Hub OS", href: "/hub-os", icon: Monitor },
];

// Same 8 items as directionsNav, grouped by where they sit on a business's
// path — for the sidebar specifically. Kept separate from directionsNav
// (which stays flat) since site-search.tsx indexes that one without caring
// about grouping.
export const directionsNavGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Запуск и масштабирование",
    items: [
      { label: "Start", href: "/start", icon: RocketIllustration },
      { label: "Business", href: "/business", icon: BriefcaseIllustration },
      { label: "Factory", href: "/factory", icon: FactoryIllustration },
      { label: "Fulfillment", href: "/fulfillment", icon: WarehouseIllustration },
      { label: "Logistics", href: "/logistics", icon: TruckIllustration },
    ],
  },
  {
    label: "Обучение и технологии",
    items: [
      { label: "Academy", href: "/academy", icon: AcademyIllustration },
      { label: "AI", href: "/ai", icon: RobotIllustration },
      { label: "Hub OS", href: "/hub-os", icon: Monitor },
    ],
  },
];

export const secondaryNav: NavItem[] = [
  { label: "Кейсы", href: "/cases", icon: FolderKanban },
  { label: "Цены", href: "/pricing", icon: Tag },
  { label: "Отзывы", href: "/reviews", icon: MessageSquare },
  { label: "О компании", href: "/about", icon: UserRound },
  { label: "Контакты", href: "/contacts", icon: Phone },
];
