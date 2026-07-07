import Link from "next/link";
import type { IconComponent } from "@/types";
import { cn } from "@/lib/utils";

interface DirectionChipProps {
  icon: IconComponent;
  label: string;
  href?: string;
  className?: string;
}

function DirectionChip({ icon: Icon, label, href = "#", className }: DirectionChipProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </span>
      {label}
    </Link>
  );
}

export { DirectionChip };
