"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { directions, hubOs } from "@/data/directions";
import { cn } from "@/lib/utils";

const productRoutes: Record<string, string> = Object.fromEntries(
  [...directions, hubOs].map((direction) => [direction.title, `/${direction.slug}`]),
);

interface EcosystemFlowProps {
  items: string[];
  className?: string;
}

function EcosystemFlow({ items, className }: EcosystemFlowProps) {
  const pathname = usePathname();

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {items.map((item, index) => {
        const href = productRoutes[item];
        const isActive = href === pathname;
        const pillClasses = cn(
          "rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors",
          isActive
            ? "border-transparent bg-gradient-to-r from-primary to-secondary text-white"
            : "border-border bg-surface text-text-secondary hover:border-primary/30",
        );

        return (
          <div key={item} className="flex items-center gap-2">
            {href ? (
              <Link href={href} className={pillClasses}>
                {item}
              </Link>
            ) : (
              <span className={pillClasses}>{item}</span>
            )}
            {index < items.length - 1 && (
              <ArrowRight className="h-4 w-4 shrink-0 text-border" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export { EcosystemFlow };
