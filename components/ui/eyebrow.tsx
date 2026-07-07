import { cn } from "@/lib/utils";

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-primary to-secondary" />
      {children}
    </div>
  );
}

export { Eyebrow };
