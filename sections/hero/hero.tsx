import { ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  AcademyIllustration,
  BriefcaseIllustration,
  FactoryIllustration,
  RobotIllustration,
  RocketIllustration,
  TruckIllustration,
  WarehouseIllustration,
} from "@/components/panda/direction-illustrations";
import { FloatingProductCard } from "@/components/panda/floating-product-card";
import { HeroGlobe } from "@/components/panda/hero-globe";
import { buttonVariants } from "@/components/ui/button";
import { MobileHeroCarousel } from "@/sections/hero/hero-mobile-carousel";
import { MobileSocialProof } from "@/sections/hero/hero-mobile-composition";

const metrics = [
  { value: "6", label: "стран-партнёров" },
  { value: "5", label: "сервисов в одном хабе" },
  { value: "24/7", label: "Panda AI на связи" },
];

const leftCards = [
  {
    id: "start",
    icon: RocketIllustration,
    title: (
      <>
        Panda <span className="text-primary">Start</span>
      </>
    ),
    label: "Start",
    description: "Запуск бизнеса с Китаем",
    iconClassName: undefined,
    dotClassName: "bg-orange-500",
    href: "/start",
  },
  {
    id: "logistics",
    icon: TruckIllustration,
    title: (
      <>
        Panda <span className="text-primary">Logistics</span>
      </>
    ),
    label: "Global",
    description: "Международная логистика",
    iconClassName: undefined,
    dotClassName: "bg-red-500",
    href: "/logistics",
  },
  {
    id: "fulfillment",
    icon: WarehouseIllustration,
    title: (
      <>
        Panda <span className="text-primary">Fulfillment</span>
      </>
    ),
    label: "24/7",
    description: "Ваш склад в Китае",
    iconClassName: undefined,
    dotClassName: "bg-amber-500",
    href: "/fulfillment",
  },
  {
    id: "business",
    icon: BriefcaseIllustration,
    title: (
      <>
        Panda <span className="text-primary">Business</span>
      </>
    ),
    label: "Business",
    description: "Ваш удалённый офис",
    iconClassName: undefined,
    dotClassName: "bg-primary",
    href: "/business",
  },
];

const rightCards = [
  {
    id: "ai",
    icon: RobotIllustration,
    title: (
      <>
        Panda <span className="text-primary">AI</span>
      </>
    ),
    label: "AI",
    description: "ИИ для вашего бизнеса",
    iconClassName: undefined,
    dotClassName: "bg-primary",
    href: "/ai",
  },
  {
    id: "academy",
    icon: AcademyIllustration,
    title: (
      <>
        Panda <span className="text-primary">Academy</span>
      </>
    ),
    label: "Скоро",
    description: "Обучение предпринимателей",
    iconClassName: undefined,
    dotClassName: "bg-pink-500",
    href: "/academy",
  },
  {
    id: "factory",
    icon: FactoryIllustration,
    title: (
      <>
        Panda <span className="text-primary">Factory</span>
      </>
    ),
    label: "OEM · ODM",
    description: "Свой бренд под ключ",
    iconClassName: undefined,
    dotClassName: "bg-gray-500",
    href: "/factory",
  },
  {
    id: "payments",
    icon: ShieldCheck,
    title: "Secure Payments",
    label: "Защита",
    description: "Безопасные платежи",
    iconClassName: "bg-success/10 text-success",
    dotClassName: "bg-success",
  },
];

const CARD_TILT = 22;
const CARD_W = 208;
const CARD_H = 108;

// Cards sit on an ellipse centred on the globe, so they orbit the panda
// instead of overlapping it. Angles are measured clockwise from the top,
// and skip the bottom arc so the podium stays visible below the panda's feet.
// The horizontal center is expressed as calc(50% + …) — not a hardcoded pixel
// value — so it stays correct even if the container renders narrower than
// its max-width (e.g. on a smaller "xl" viewport).
const ORBIT_CY = 270;
const ORBIT_RX = 215;
const ORBIT_RY = 245;
// The last angle is pulled in from 160° to 146° — near the bottom, sin(angle)
// shrinks fast, so the mirrored left/right cards would otherwise sit almost
// on the centerline and overlap (unlike the top pair, which has room to spare).
const ORBIT_ANGLES = [32, 76, 120, 146];
// Pulling the last angle in for horizontal spacing also raises it vertically,
// which then collides with the row above — nudge each row down independently
// to restore clearance without undoing the horizontal fix.
const ROW_Y_NUDGE = [0, 0, 0, 46];

function ellipsePoint(angleDeg: number, side: 1 | -1, yNudge: number) {
  const rad = (angleDeg * Math.PI) / 180;
  const offsetX = side * ORBIT_RX * Math.sin(rad) - CARD_W / 2;
  const y = ORBIT_CY - ORBIT_RY * Math.cos(rad) - CARD_H / 2 + yNudge;
  return {
    left: `calc(50% + ${Math.round(offsetX)}px)`,
    top: `${Math.round(y)}px`,
  };
}

const productCards = [
  ...leftCards.map((card, i) => ({
    ...card,
    position: ellipsePoint(ORBIT_ANGLES[i], -1, ROW_Y_NUDGE[i]),
    tilt: CARD_TILT,
  })),
  ...rightCards.map((card, i) => ({
    ...card,
    position: ellipsePoint(ORBIT_ANGLES[i], 1, ROW_Y_NUDGE[i]),
    tilt: -CARD_TILT,
  })),
];

function HeroVisual() {
  return (
    <div className="relative mx-auto hidden h-155 w-full max-w-xl min-[1400px]:-translate-x-10 min-[1400px]:block">
      <div className="absolute left-1/2 -top-18 h-172.5 w-172.5 -translate-x-1/2">
        <HeroGlobe />
      </div>

      <div className="absolute bottom-11 left-1/2 -translate-x-1/2">
        <div className="h-10 w-84 rounded-[100%] bg-gradient-to-r from-primary/50 to-secondary/50 blur-3xl" />
        <div className="absolute inset-x-0 top-0 mx-auto h-9 w-84 rounded-[100%] border border-white/70 bg-white/25 backdrop-blur-sm" />
        <div className="absolute inset-x-0 top-2 mx-auto h-6 w-64 rounded-[100%] border border-primary/40" />
        <div className="absolute inset-x-0 top-3.5 mx-auto h-3 w-44 rounded-[100%] border border-secondary/35" />
      </div>

      <div className="absolute bottom-0 left-1/2 h-125 w-80 -translate-x-1/2 animate-panda-sway">
        <Image
          src="/images/mascot.png"
          alt="Panda Bridge"
          width={320}
          height={500}
          className="relative h-full w-auto object-contain drop-shadow-2xl"
          priority
        />
      </div>

      {productCards.map((card, i) => (
        <FloatingProductCard
          key={card.id}
          icon={card.icon}
          title={card.title}
          label={card.label}
          description={card.description}
          iconClassName={card.iconClassName}
          dotClassName={card.dotClassName}
          tilt={card.tilt}
          floatDelay={`${i * 0.35}s`}
          floatDuration={`${4 + (i % 3) * 0.6}s`}
          href={card.href}
          className="absolute z-20 h-27 w-52"
          style={card.position}
          data-service-id={card.id}
        />
      ))}
    </div>
  );
}

function Hero() {
  return (
    <section className="relative mx-auto max-w-7xl px-4 pt-7.5 pb-12 sm:px-6 lg:pb-16">
      <div className="grid grid-cols-1 items-center gap-12 min-[1400px]:grid-cols-[42%_58%]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Экосистема для бизнеса с Китаем
          </span>

          <h1 className="mt-5 text-4xl font-extrabold leading-tight text-text sm:text-5xl">
            <span className="block">Бизнес с Китаем</span>
            <span className="block bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              начинается здесь
            </span>
          </h1>

          <p className="mt-5 max-w-lg text-base text-text-secondary">
            Вам не нужно искать поставщика, логиста, склад и маркетолога по отдельности.
            Один партнёр закрывает весь путь — от поиска товара до продаж на маркетплейсах.
          </p>

          <div className="mt-8 flex flex-col items-stretch gap-3 md:flex-row md:items-center md:flex-wrap">
            <Link
              href="/contacts"
              className={buttonVariants({ variant: "primary", size: "lg", className: "md:w-auto" })}
            >
              Начать работу
            </Link>
            <Link
              href="/ecosystem"
              className={buttonVariants({ variant: "outline", size: "lg", className: "md:w-auto" })}
            >
              Изучить экосистему <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 hidden divide-x divide-border border-t border-border pt-6 min-[1400px]:flex">
            {metrics.map((metric) => (
              <div key={metric.label} className="flex-1 pl-6 first:pl-0">
                <div className="text-xl font-bold text-text">{metric.value}</div>
                <div className="text-sm text-text-secondary">{metric.label}</div>
              </div>
            ))}
          </div>
        </div>

        <HeroVisual />
      </div>

      <MobileHeroCarousel>
        {[...leftCards, ...rightCards].map((card) => (
          <FloatingProductCard
            key={card.label}
            icon={card.icon}
            title={card.title}
            label={card.label}
            description={card.description}
            iconClassName={card.iconClassName}
            dotClassName={card.dotClassName}
            href={card.href}
            className="h-36 w-[76%] shrink-0 snap-start tablet:w-72"
          />
        ))}
      </MobileHeroCarousel>
      <MobileSocialProof />

      <div className="mt-12 hidden justify-center min-[1400px]:flex">
        <div className="flex flex-col items-center gap-1 text-xs font-medium text-text-secondary">
          Прокрутите вниз
          <ChevronDown className="h-4 w-4 animate-bounce" />
        </div>
      </div>
    </section>
  );
}

export { Hero };
