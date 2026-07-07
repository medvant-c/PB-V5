import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-6 sm:px-6">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="mt-3 text-3xl font-extrabold text-text sm:text-4xl">{title}</h1>
      {description && <p className="mt-3 max-w-2xl text-base text-text-secondary">{description}</p>}
      {actions && <div className="mt-5">{actions}</div>}
    </div>
  );
}

export { PageHeader };
