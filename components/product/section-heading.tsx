import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  description?: string;
  center?: boolean;
  className?: string;
}

function SectionHeading({ eyebrow, title, description, center, className }: SectionHeadingProps) {
  return (
    <div className={cn(center && "text-center", className)}>
      <Eyebrow className={cn(center && "justify-center")}>{eyebrow}</Eyebrow>
      <h2 className="mt-3 text-3xl font-extrabold text-text sm:text-4xl">{title}</h2>
      {description && (
        <p className={cn("mt-3 max-w-2xl text-base text-text-secondary", center && "mx-auto")}>
          {description}
        </p>
      )}
    </div>
  );
}

export { SectionHeading };
