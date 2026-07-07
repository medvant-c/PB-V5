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
