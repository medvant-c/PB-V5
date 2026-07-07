import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import type { IconComponent } from "@/types";
import { cn } from "@/lib/utils";

interface FloatingProductCardProps {
  icon: IconComponent;
  title: ReactNode;
  label: string;
  description: string;
  iconClassName?: string;
  dotClassName: string;
  tilt?: number;
  floatDelay?: string;
  floatDuration?: string;
  href?: string;
  style?: CSSProperties;
  className?: string;
}

function FloatingProductCard({
  icon: Icon,
  title,
  label,
  description,
  iconClassName,
  dotClassName,
  tilt = 0,
  floatDelay,
  floatDuration,
  href,
  style,
  className,
}: FloatingProductCardProps) {
  const content = (
    <>
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-gray-50",
          iconClassName,
        )}
      >
        <Icon className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-text">{title}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-text-secondary">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClassName)} />
          <span className="truncate">{label}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-snug text-text-secondary">{description}</p>
      </div>
    </>
  );

  const isFloating = Boolean(floatDelay || floatDuration);

  const cardClassName = cn(
    "flex h-27 w-52 items-start gap-3 rounded-2xl border border-border bg-surface/95 p-3 shadow-lg shadow-primary/5 backdrop-blur-sm",
    href && "transition-colors hover:border-primary/30 hover:bg-surface",
    isFloating && "animate-float-card",
  );

  const cardStyle: CSSProperties | undefined = isFloating
    ? { animationDelay: floatDelay, animationDuration: floatDuration }
    : undefined;

  const outerStyle: CSSProperties = {
    ...style,
    transform: tilt ? `perspective(500px) rotateY(${tilt}deg)` : undefined,
  };

  const card = href ? (
    <Link href={href} className={cardClassName} style={cardStyle}>
      {content}
    </Link>
  ) : (
    <div className={cardClassName} style={cardStyle}>
      {content}
    </div>
  );

  return (
    <div className={className} style={outerStyle}>
      {card}
    </div>
  );
}

export { FloatingProductCard };
