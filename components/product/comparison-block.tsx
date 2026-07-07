import { Check, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ComparisonSide {
  title: string;
  items: string[];
  tone: "bad" | "good" | "neutral";
}

function ComparisonBlock({ left, right }: { left: ComparisonSide; right: ComparisonSide }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {[left, right].map((side) => (
        <Card
          key={side.title}
          className={cn(
            "p-6",
            side.tone === "bad" && "border-error/20 bg-error/5",
            side.tone === "good" && "border-success/20 bg-success/5",
          )}
        >
          <h3 className="text-base font-bold text-text">{side.title}</h3>
          <ul className="mt-4 space-y-2.5">
            {side.items.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-text">
                {side.tone === "bad" ? (
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-error" />
                ) : (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                )}
                {item}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

export { ComparisonBlock };
export type { ComparisonSide };
