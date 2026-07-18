"use client";

import { useState } from "react";
import Link from "next/link";
import { Calculator, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CargoType = "standard" | "fragile" | "oversized";

const cargoLabels: Record<CargoType, string> = {
  standard: "Обычный груз",
  fragile: "Хрупкий груз",
  oversized: "Крупногабаритный",
};

const cargoMultiplier: Record<CargoType, number> = {
  standard: 1,
  fragile: 1.25,
  oversized: 1.4,
};

interface Estimate {
  cost: number;
  days: string;
  method: string;
}

function estimate(weight: number, volume: number, cargo: CargoType): Estimate {
  const base = 180 + weight * 95 + volume * 1150;
  const cost = Math.round((base * cargoMultiplier[cargo]) / 10) * 10;

  if (volume <= 1) {
    return { cost, days: "5–8 дней", method: "Авиа доставка" };
  }
  if (volume <= 5) {
    return { cost, days: "12–18 дней", method: "Сборный груз (LCL)" };
  }
  return { cost, days: "25–35 дней", method: "Морская доставка (FCL)" };
}

function DeliveryCalculator() {
  const [weight, setWeight] = useState(50);
  const [volume, setVolume] = useState(1);
  const [cargo, setCargo] = useState<CargoType>("standard");
  const [result, setResult] = useState<Estimate | null>(null);

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Calculator className="h-5 w-5" />
        </span>
        <div>
          <div className="text-sm font-bold text-text">Оцените примерную стоимость доставки</div>
          <div className="text-xs text-text-secondary">
            Быстрая прикидка по весу и объёму — точная цена зависит от маршрута, сезона и таможни
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="text-sm">
          <span className="text-text-secondary">Вес, кг</span>
          <input
            type="number"
            min={1}
            value={weight}
            onChange={(event) => setWeight(Number(event.target.value) || 0)}
            className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-text outline-none focus:border-primary"
          />
        </label>

        <label className="text-sm">
          <span className="text-text-secondary">Объём, м³</span>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value) || 0)}
            className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-text outline-none focus:border-primary"
          />
        </label>

        <label className="text-sm">
          <span className="text-text-secondary">Тип груза</span>
          <select
            value={cargo}
            onChange={(event) => setCargo(event.target.value as CargoType)}
            className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-text outline-none focus:border-primary"
          >
            {Object.entries(cargoLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        onClick={() => setResult(estimate(weight, volume, cargo))}
        className={cn(buttonVariants({ variant: "primary" }), "mt-5")}
      >
        Рассчитать стоимость
      </button>

      {result && (
        <div className="mt-6 rounded-2xl bg-black/3 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs text-text-secondary">Ориентировочная стоимость</div>
              <div className="mt-1 text-lg font-bold text-text">от {result.cost.toLocaleString("ru-RU")} ₽</div>
            </div>
            <div>
              <div className="text-xs text-text-secondary">Срок доставки</div>
              <div className="mt-1 text-lg font-bold text-text">{result.days}</div>
            </div>
            <div>
              <div className="text-xs text-text-secondary">Рекомендуемый способ</div>
              <div className="mt-1 text-lg font-bold text-text">{result.method}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-col items-start gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-text-secondary">
              Прикидка для быстрой ориентации — не финальное предложение. Точную цену считаем под ваш груз и маршрут.
            </p>
            <Link
              href="/contacts"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
            >
              Получить точный расчёт <Send className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}

export { DeliveryCalculator };
