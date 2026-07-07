"use client";

import { useState } from "react";
import { Bot, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ChatExample {
  prompt: string;
  points: string[];
  metrics: { label: string; value: string }[];
}

const examples: ChatExample[] = [
  {
    prompt: "Хочу продавать термосы на WB",
    points: [
      "Анализ рынка и спроса",
      "Конкуренты",
      "Пример прибыли",
      "Рекомендуемая закупка",
      "Лучшие фабрики",
      "Расчёт логистики",
      "Документы",
    ],
    metrics: [
      { label: "Нужно денег", value: "≈ 340 000 ₽" },
      { label: "Выход в прибыль", value: "через 6–8 недель" },
    ],
  },
  {
    prompt: "Найди фабрику по производству детских рюкзаков",
    points: [
      "Проверка опыта и лицензий",
      "Экспортный опыт фабрики",
      "Наличие сертификатов (ISO, CE, BSCI)",
      "MOQ и условия оплаты",
      "Проведение аудита производства",
    ],
    metrics: [
      { label: "Найдено фабрик", value: "12 проверенных" },
      { label: "Срок подбора", value: "2–3 дня" },
    ],
  },
  {
    prompt: "Сколько денег нужно, чтобы выйти на оборот 10 млн?",
    points: [
      "Расчёт закупочного бюджета",
      "Логистика и таможня",
      "Складские расходы и fulfillment",
      "Маркетинг и продвижение на маркетплейсе",
      "Резерв на кассовый разрыв",
    ],
    metrics: [
      { label: "Нужно денег", value: "≈ 2.4 млн ₽" },
      { label: "Срок выхода", value: "4–5 месяцев" },
    ],
  },
];

function AiChatDemo() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = examples[activeIndex];

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white">
          <Bot className="h-5 w-5" />
        </span>
        <div className="text-sm font-bold text-text">Panda AI</div>
      </div>

      <div className="mt-6 flex justify-end">
        <div className="max-w-md rounded-2xl rounded-tr-sm bg-black/5 px-4 py-2.5 text-sm text-text">
          {active.prompt}
        </div>
      </div>

      <div className="mt-3 flex justify-start">
        <div className="max-w-lg rounded-2xl rounded-tl-sm border border-primary/15 bg-primary/5 px-4 py-4 text-sm text-text">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Panda AI отвечает
          </div>
          <ul className="mt-3 space-y-1.5">
            {active.points.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <span className="h-1 w-1 shrink-0 rounded-full bg-primary" />
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {active.metrics.map((metric) => (
              <div key={metric.label} className="rounded-xl bg-surface px-3 py-2.5">
                <div className="text-[11px] text-text-secondary">{metric.label}</div>
                <div className="mt-0.5 text-sm font-bold text-text">{metric.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5">
        {examples.map((example, index) => (
          <button
            key={example.prompt}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={cn(
              "rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors",
              index === activeIndex
                ? "border-transparent bg-gradient-to-r from-primary to-secondary text-white"
                : "border-border text-text-secondary hover:bg-black/3",
            )}
          >
            {example.prompt}
          </button>
        ))}
      </div>
    </Card>
  );
}

export { AiChatDemo };
