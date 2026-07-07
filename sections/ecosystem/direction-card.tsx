import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { Direction } from "@/types";
import { accentIconClasses } from "@/data/directions";
import { Card } from "@/components/ui/card";

function DirectionCard({ direction }: { direction: Direction }) {
  const Icon = direction.icon;

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-black/4 px-2.5 py-1 text-xs font-semibold text-text-secondary">
          {direction.number}
        </span>
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${accentIconClasses[direction.accent]}`}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>

      <div>
        <h3 className="text-lg font-bold text-text">{direction.title}</h3>
        <p className="mt-1 text-sm text-text-secondary">{direction.description}</p>
      </div>

      <ul className="space-y-2">
        {direction.features.map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-sm text-text">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            {feature}
          </li>
        ))}
      </ul>

      <Link
        href={`/${direction.slug}`}
        className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:gap-2.5 transition-all"
      >
        Подробнее <ArrowRight className="h-4 w-4" />
      </Link>
    </Card>
  );
}

export { DirectionCard };
