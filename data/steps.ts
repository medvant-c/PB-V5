import { MessageCircle, Route, ShieldCheck, TrendingUp } from "lucide-react";
import type { Step } from "@/types";

export const steps: Step[] = [
  {
    number: "1",
    title: "Вы пишете нам",
    description: "Опишите задачу и отправьте запрос",
    icon: MessageCircle,
  },
  {
    number: "2",
    title: "Мы строим маршрут",
    description: "Подбираем решение и оптимальный путь",
    icon: Route,
  },
  {
    number: "3",
    title: "Контролируем процесс",
    description: "Полный контроль качества и сроков на каждом этапе",
    icon: ShieldCheck,
  },
  {
    number: "4",
    title: "Вы развиваете бизнес",
    description: "Получайте результат и увеличивайте прибыль",
    icon: TrendingUp,
  },
];
