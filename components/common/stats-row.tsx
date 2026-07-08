import type { Stat } from "@/types";
import { StatTile } from "@/components/ui/stat-tile";
import { cn } from "@/lib/utils";

function StatsRow({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 sm:px-6 md:grid-cols-3 xl:grid-cols-5",
        className,
      )}
    >
      {stats.map((stat) => (
        <StatTile key={stat.label} icon={stat.icon} value={stat.value} label={stat.label} />
      ))}
    </div>
  );
}

export { StatsRow };
