import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CaseStudy } from "@/types";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function CaseCard({ caseStudy }: { caseStudy: CaseStudy }) {
  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <div className={cn("relative h-40 bg-gradient-to-br", caseStudy.gradient)}>
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-text shadow-sm">
          {caseStudy.category}
        </span>
        <span className="absolute right-3 top-3 rounded-full bg-black/20 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
          Ниша: {caseStudy.niche}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6">
        <div>
          <h3 className="text-lg font-bold text-text">{caseStudy.title}</h3>
          <p className="mt-1 text-sm text-text-secondary">{caseStudy.description}</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {caseStudy.metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className="rounded-xl bg-black/3 p-2.5 text-center">
                <Icon className="mx-auto h-4 w-4 text-primary" />
                <div className="mt-1 text-sm font-bold text-text">{metric.value}</div>
                <div className="text-[11px] leading-tight text-text-secondary">{metric.label}</div>
              </div>
            );
          })}
        </div>

        <Link
          href={`/cases/${caseStudy.slug}`}
          className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-all hover:gap-2.5"
        >
          Смотреть кейс <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </Card>
  );
}

export { CaseCard };
