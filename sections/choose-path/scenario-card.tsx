import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { Scenario } from "@/types";
import { Card } from "@/components/ui/card";
import { scenarios } from "@/data/scenarios";
import { directionsNav } from "@/data/navigation";

const accentClasses: Record<Scenario["accent"], string> = {
  green: "bg-success/10 text-success",
  blue: "bg-primary/10 text-primary",
  purple: "bg-secondary/10 text-secondary",
  orange: "bg-warning/10 text-warning",
  cyan: "bg-cyan-500/10 text-cyan-600",
  indigo: "bg-indigo-500/10 text-indigo-600",
};

function ScenarioCard({ scenario }: { scenario: Scenario }) {
  const Icon = scenario.icon;
  const relatedScenarios = scenario.related
    .map((number) => scenarios.find((item) => item.number === number))
    .filter((item): item is Scenario => Boolean(item));

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-black/4 px-2.5 py-1 text-xs font-semibold text-text-secondary">
          {scenario.number}
        </span>
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${accentClasses[scenario.accent]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{scenario.audience}</p>
        <h3 className="mt-1 text-lg font-bold text-text">{scenario.title}</h3>
        <p className="mt-1 text-sm text-text-secondary">{scenario.description}</p>
      </div>

      <ul className="space-y-2">
        {scenario.features.map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-sm text-text">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            {feature}
          </li>
        ))}
      </ul>

      <div className="mt-auto space-y-3">
        <Link
          href={scenario.href}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-all hover:gap-2.5"
        >
          Это мой сценарий <ArrowRight className="h-4 w-4" />
        </Link>

        {relatedScenarios.length > 0 && (
          <p className="text-xs text-text-secondary">
            Часто выбирают вместе:{" "}
            {relatedScenarios.map((related, index) => {
              const navLabel = directionsNav.find((item) => item.href === related.href)?.label ?? related.title;
              return (
                <span key={related.number}>
                  <Link
                    href={related.href}
                    className="font-medium text-text underline decoration-border underline-offset-2 hover:text-primary"
                  >
                    {navLabel}
                  </Link>
                  {index < relatedScenarios.length - 1 ? ", " : ""}
                </span>
              );
            })}
          </p>
        )}
      </div>
    </Card>
  );
}

export { ScenarioCard };
