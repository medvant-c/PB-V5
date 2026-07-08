import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatTileProps {
  icon: LucideIcon;
  value: string;
  label: string;
  iconClassName?: string;
}

function StatTile({ icon: Icon, value, label, iconClassName }: StatTileProps) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary",
          iconClassName,
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-xl font-bold text-text">{value}</div>
        <div className="wrap-break-word text-sm text-text-secondary [hyphens:auto]">{label}</div>
      </div>
    </Card>
  );
}

export { StatTile };
