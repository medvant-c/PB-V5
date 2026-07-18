import type { LucideIcon } from "lucide-react";

export type IconComponent = React.ComponentType<{ className?: string }>;

export interface NavItem {
  label: string;
  href: string;
  icon: IconComponent;
}

export interface Direction {
  slug: string;
  number: string;
  title: string;
  shortTitle: string;
  tagline: string;
  description: string;
  icon: IconComponent;
  accent: "green" | "blue" | "purple" | "orange" | "cyan" | "teal" | "indigo";
  features: string[];
  comingSoon?: boolean;
}

export interface Scenario {
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: "green" | "blue" | "purple" | "orange" | "cyan" | "indigo";
  features: string[];
  href: string;
  audience: string;
  related: string[];
}

export interface CaseMetric {
  icon: LucideIcon;
  value: string;
  label: string;
}

export interface CaseStudy {
  slug: string;
  category: string;
  niche: string;
  title: string;
  description: string;
  metrics: CaseMetric[];
  gradient: string;
}

export interface Review {
  name: string;
  role: string;
  tag: string;
  quote: string;
  rating: number;
  date: string;
  location: string;
}

export interface Step {
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface Stat {
  icon: LucideIcon;
  value: string;
  label: string;
}

export interface ContactChannel {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  href?: string;
}

export interface PriceItem {
  service: string;
  price: string;
  result: string;
  /** Optional downloadable sample report shown in the tooltip, e.g. "/documents/analiz-nishi-primer.pdf". */
  sampleFile?: string;
  /** Human-readable filename the browser saves the sample as, e.g. "Анализ ниши — пример отчёта.pdf". */
  sampleFileName?: string;
}

export interface PriceCategory {
  title: string;
  items: PriceItem[];
}

export interface ProductPricing {
  id: string;
  categories: PriceCategory[];
}

export interface DeskTemplate {
  category: string;
  number: string;
  title: string;
  when: string;
  body: string;
}
