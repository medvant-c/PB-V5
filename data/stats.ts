import { Headset, Infinity as InfinityIcon, Layers, Network, ShieldCheck } from "lucide-react";
import type { Stat } from "@/types";

export const homeStats: Stat[] = [
  { icon: Network, value: "7", label: "направлений по Миру" },
  { icon: Layers, value: "1", label: "Единая экосистема " },
  { icon: ShieldCheck, value: "100+", label: "проверенных производителей" },
  { icon: Headset, value: "24/7", label: "поддержка на всех этапах" },
  { icon: InfinityIcon, value: "∞", label: "масштабирование без границ" },
];

export const ecosystemStats: Stat[] = [
  { icon: Headset, value: "1000", label: "клиентов по всему миру" },
  { icon: ShieldCheck, value: "250+", label: "проверенных фабрик" },
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

export const contactStats: Stat[] = [
  { icon: Network, value: "30+", label: "стран присутствия" },
  { icon: Headset, value: "1000+", label: "клиентов по всему миру" },
  { icon: Layers, value: "20+", label: "городов в Китае" },
  { icon: ShieldCheck, value: "6", label: "складов и офисов" },
];
