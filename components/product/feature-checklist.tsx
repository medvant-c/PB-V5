import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FeatureChecklistProps {
  items: string[];
  columns?: 1 | 2 | 3;
  bare?: boolean;
  className?: string;
}

function FeatureChecklist({ items, columns = 2, bare, className }: FeatureChecklistProps) {
  const list = (
    <ul
      className={cn(
        "grid grid-cols-1 gap-3",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {items.map((item) => (
        <li key={item} className="flex items-center gap-2.5 text-sm text-text">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          {item}
        </li>
      ))}
    </ul>
  );

  if (bare) return <div className={className}>{list}</div>;

  return <Card className={cn("p-6 sm:p-8", className)}>{list}</Card>;
}

export { FeatureChecklist };
