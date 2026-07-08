import type { CSSProperties } from "react";
import Image from "next/image";
import { Factory, MapPin, Package, ShoppingCart, TrendingUp, Truck } from "lucide-react";
import type { IconComponent } from "@/types";
import { cn } from "@/lib/utils";

interface InfoCardProps {
  icon: IconComponent;
  title: string;
  highlight: string;
  tone?: "default" | "success";
  iconClassName?: string;
  width?: number;
  translucent?: boolean;
  style: CSSProperties;
  className?: string;
}

function InfoCard({
  icon: Icon,
  title,
  highlight,
  tone = "default",
  iconClassName,
  width = 135,
  translucent = false,
  style,
  className,
}: InfoCardProps) {
  return (
    <div
      className={cn(
        "absolute flex items-start gap-2 rounded-xl border border-border p-2.5 shadow-sm",
        translucent ? "bg-surface/70 backdrop-blur-sm" : "bg-surface",
        className,
      )}
      style={{ width, ...style }}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary",
          iconClassName,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="wrap-break-word text-[12px] font-normal text-text-secondary [hyphens:auto]">{title}</div>
        <div
          className={cn(
            "wrap-break-word mt-0.5 text-[13px] font-medium [hyphens:auto]",
            tone === "success" ? "text-success" : "text-text",
          )}
        >
          {highlight}
        </div>
      </div>
    </div>
  );
}

// Each connector runs from the right edge of its card to one shared point
// near the panda's chest, in the same 0-100 percent coordinate space as the
// info cards below, so every line visually reads as "this card is linked to
// the panda" rather than a disconnected decorative mark.
const CONNECTORS = ["M 61 10 Q 66 35 60 65", "M 39 28 Q 52 40 60 65", "M 40 46 Q 52 55 60 65"];

function WorldMapDots() {
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="absolute inset-x-0 bottom-0 z-0 h-[42%] w-full text-primary opacity-[0.12]"
      aria-hidden="true"
    >
      <pattern id="hero-mobile-dots" width="4" height="4" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="0.7" fill="currentColor" />
      </pattern>
      <rect width="100" height="40" fill="url(#hero-mobile-dots)" />
    </svg>
  );
}

function MobileHeroComposition() {
  return (
    <div className="relative mx-auto mt-8 hidden aspect-9/13.5 w-full max-w-sm min-[768px]:block min-[1400px]:hidden">
      <WorldMapDots />

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 z-10 h-full w-full"
        aria-hidden="true"
      >
        <g stroke="rgba(102, 112, 133, 0.35)" strokeWidth="0.35" strokeDasharray="1.2 1.2" fill="none">
          {CONNECTORS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </svg>

      <div className="absolute bottom-0 left-[-6%] z-10 w-[24%]">
        <Image
          src="/images/hero-ship.png"
          alt=""
          aria-hidden="true"
          loading="lazy"
          width={220}
          height={330}
          className="h-auto w-full object-contain"
        />
        <div className="absolute -bottom-1 left-1/2 h-3 w-[130%] -translate-x-1/2 rounded-[100%] bg-primary/15 blur-md" />
      </div>

      <div className="absolute right-[1%] bottom-0 z-30 w-[16%]">
        <Image
          src="/images/hero-containers.png"
          alt=""
          aria-hidden="true"
          loading="lazy"
          width={160}
          height={240}
          className="h-auto w-full object-contain"
        />
        <span className="absolute -top-3 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-white shadow-md">
          <MapPin className="h-3.5 w-3.5" />
        </span>
      </div>

      <div className="absolute right-[3%] bottom-0 z-20 w-[48%]">
        <Image
          src="/images/mascot-mobile.png"
          alt="Panda Bridge"
          unoptimized
          width={440}
          height={660}
          className="relative h-auto w-full object-contain drop-shadow-2xl"
          priority
        />
      </div>

      <InfoCard
        icon={TrendingUp}
        title="Аналитика"
        highlight="рост продаж +127%"
        tone="success"
        iconClassName="bg-success/10 text-success"
        className="z-30"
        style={{ top: "2%", left: "22%" }}
      />
      <InfoCard
        icon={Package}
        title="Товары"
        highlight="поиск и проверка"
        className="z-30"
        style={{ top: "20%", left: "0%" }}
      />
      <InfoCard
        icon={Truck}
        title="Логистика"
        highlight="доставка по миру"
        className="z-30"
        style={{ top: "38%", left: "1%" }}
      />

      <div className="absolute z-30 text-left" style={{ top: "55%", left: "6%", width: "39%" }}>
        <h2 className="text-base font-extrabold leading-tight text-text">Ваш бизнес без границ</h2>
        <p className="mt-1.5 text-[11px] leading-snug text-text-secondary">
          Технологии, логистика и экспертиза для роста на глобальном рынке
        </p>
        <span className="mt-2 block h-1 w-10 rounded-full bg-gradient-to-r from-primary to-secondary" />
      </div>

      <InfoCard
        icon={ShoppingCart}
        title="Продажи"
        highlight="маркетплейсы"
        width={130}
        className="z-30"
        style={{ top: "76%", left: "12%" }}
      />

      <InfoCard
        icon={Factory}
        title="Производство"
        highlight="надёжные фабрики"
        width={158}
        iconClassName="bg-secondary/10 text-secondary"
        translucent
        className="z-30"
        style={{ top: "70%", right: "3%" }}
      />
    </div>
  );
}

function MobileSocialProof() {
  const avatars = [{ initials: "ИП" }, { initials: "АС" }, { initials: "ДВ" }];

  return (
    <div className="mx-auto mt-6 flex max-w-sm items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 min-[1400px]:hidden">
      <div className="flex shrink-0 -space-x-3">
        {avatars.map((avatar) => (
          <span
            key={avatar.initials}
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface bg-gradient-to-br from-primary/20 to-secondary/20 text-xs font-bold text-text-secondary"
          >
            {avatar.initials}
          </span>
        ))}
      </div>
      <p className="text-sm text-text-secondary">
        <span className="font-bold text-text">Более 500+ компаний</span> уже масштабируют бизнес с нами
      </p>
    </div>
  );
}

export { MobileHeroComposition, MobileSocialProof };
