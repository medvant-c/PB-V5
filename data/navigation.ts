import {
  FolderKanban,
  Home,
  MessageSquare,
  Monitor,
  Network,
  Phone,
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

export const secondaryNav: NavItem[] = [
  { label: "Кейсы", href: "/cases", icon: FolderKanban },
  { label: "Отзывы", href: "/reviews", icon: MessageSquare },
  { label: "О компании", href: "/about", icon: UserRound },
  { label: "Контакты", href: "/contacts", icon: Phone },
];
