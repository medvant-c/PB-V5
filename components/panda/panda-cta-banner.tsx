import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Send } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface PandaCtaBannerProps {
  title: string;
  description: string;
  actions?: ReactNode;
}

function PandaCtaBanner({ title, description, actions }: PandaCtaBannerProps) {
  return (
    <Card className="flex flex-col items-start gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <span className="relative flex h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-secondary">
          <Image
            src="/images/mascot.png"
            alt="Panda Bridge"
            fill
            sizes="56px"
            className="object-cover object-top"
          />
        </span>
        <div>
          <div className="text-base font-bold text-text">{title}</div>
          <p className="text-sm text-text-secondary">{description}</p>
        </div>
      </div>
      <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
        {actions ?? (
          <Link href="/contacts" className={buttonVariants({ variant: "primary" })}>
            Связаться с нами <Send className="h-4 w-4" />
          </Link>
        )}
      </div>
    </Card>
  );
}

export { PandaCtaBanner };
