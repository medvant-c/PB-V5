import { Headset, Infinity as InfinityIcon, Layers, Network, ShieldCheck } from "lucide-react";
import type { Stat } from "@/types";

// Single source of truth for the "verified factories" claim — it used to be
// hardcoded separately (and inconsistently: 100+/250+/50+) in homeStats,
// ecosystemStats, and sections/about/trust-stats.tsx.
export const VERIFIED_FACTORIES_COUNT = "250+";

export const homeStats: Stat[] = [
  { icon: Network, value: "7", label: "направлений по Миру" },
  { icon: Layers, value: "1", label: "Единая экосистема " },
  { icon: ShieldCheck, value: VERIFIED_FACTORIES_COUNT, label: "проверенных фабрик" },
  { icon: Headset, value: "24/7", label: "Panda AI на связи" },
  { icon: InfinityIcon, value: "∞", label: "масштабирование без границ" },
];

export const ecosystemStats: Stat[] = [
  { icon: Headset, value: "1000", label: "клиентов по всему миру" },
  { icon: ShieldCheck, value: VERIFIED_FACTORIES_COUNT, label: "проверенных фабрик" },
  { icon: Layers, value: "2500+м²", label: "складских помещений" },
  { icon: Network, value: "1000+", label: "доставок выполнено" },
  { icon: InfinityIcon, value: "6+", label: "стран присутствия" },
];

export const caseStats: Stat[] = [
  { icon: ShieldCheck, value: "150+", label: "проектов выполнено" },
  { icon: Headset, value: "98%", label: "клиентов довольны" },
  { icon: Network, value: "45–300%", label: "рост прибыли у клиентов" },
  { icon: Layers, value: "4.9 / 5", label: "средняя оценка сотрудничества" },
];

export const reviewStats: Stat[] = [
  { icon: Headset, value: "1000+", label: "довольных клиентов" },
  { icon: Network, value: "4.9 / 5", label: "средняя оценка" },
  { icon: ShieldCheck, value: "98%", label: "клиентов рекомендуют нас" },
  { icon: Layers, value: "90%", label: "клиентов работают с нами повторно" },
];
