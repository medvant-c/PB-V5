"use client";

import { useMemo, useState } from "react";
import { caseCategories, cases } from "@/data/cases";
import { CaseCard } from "@/sections/cases/case-card";
import { cn } from "@/lib/utils";

function CasesExplorer() {
  const [active, setActive] = useState<(typeof caseCategories)[number]>("Все кейсы");

  const filtered = useMemo(
    () => (active === "Все кейсы" ? cases : cases.filter((c) => c.category === active)),
    [active],
  );

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {caseCategories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActive(category)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              active === category
                ? "bg-primary text-white"
                : "bg-black/3 text-text-secondary hover:bg-black/6",
            )}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((caseStudy) => (
          <CaseCard key={caseStudy.title} caseStudy={caseStudy} />
        ))}
      </div>
    </div>
  );
}

export { CasesExplorer };
