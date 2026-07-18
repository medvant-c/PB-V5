import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// One visual language for "there's nothing here" across every desk tab —
// previously some tabs used a dashed-border card with an icon and others
// used a bare line of grey text for the same meaning, which reads as
// unfinished even where nothing is actually broken.
interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  compact?: boolean;
}

function EmptyState({ icon: Icon, message, compact = false }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed border-border bg-surface text-center",
        compact ? "gap-1.5 px-3 py-5" : "gap-3 px-6 py-10",
      )}
    >
      <Icon className={cn("text-text-secondary", compact ? "h-4 w-4" : "h-6 w-6")} />
      <p className={cn("max-w-sm text-text-secondary", compact ? "text-xs" : "text-sm")}>{message}</p>
    </div>
  );
}

export { EmptyState };
