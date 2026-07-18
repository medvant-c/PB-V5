"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import {
  AcademyIllustration,
  BriefcaseIllustration,
  FactoryIllustration,
  RobotIllustration,
  RocketIllustration,
  TruckIllustration,
  WarehouseIllustration,
} from "@/components/panda/direction-illustrations";
import { Reveal } from "@/components/common/reveal";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/utils";

// Order matters here — it's the visual chain from first contact with an idea
// to a running, AI-assisted business, matching the doc's Start → Factory →
// Logistics → Fulfillment → Business → Academy → AI sequence.
const ecosystemNodes = [
  { id: "start", icon: RocketIllustration, label: "Start", caption: "Запуск бизнеса с Китаем" },
  { id: "factory", icon: FactoryIllustration, label: "Factory", caption: "Производство под вашим брендом" },
  { id: "logistics", icon: TruckIllustration, label: "Logistics", caption: "Международная логистика" },
  { id: "fulfillment", icon: WarehouseIllustration, label: "Fulfillment", caption: "Ваш склад в Китае" },
  { id: "business", icon: BriefcaseIllustration, label: "Business", caption: "Ваш удалённый офис" },
  { id: "academy", icon: AcademyIllustration, label: "Academy", caption: "Обучение предпринимателей" },
  { id: "ai", icon: RobotIllustration, label: "AI", caption: "ИИ для вашего бизнеса" },
];

function EcosystemNode({
  node,
  active,
  onActivate,
  onDeactivate,
}: {
  node: (typeof ecosystemNodes)[number];
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
}) {
  const Icon = node.icon;

  return (
    <button
      type="button"
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      onFocus={onActivate}
      onBlur={onDeactivate}
      onClick={onActivate}
      className="flex flex-1 flex-col items-center gap-2 px-1 text-center"
    >
      <motion.span
        animate={{ scale: active ? 1.12 : 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={cn(
          "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border transition-colors duration-200",
          active ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-text-secondary",
        )}
      >
        <Icon className="h-7 w-7" />
      </motion.span>
      <span className="text-xs font-bold text-text">
        Panda <span className="text-primary">{node.label}</span>
      </span>
      <AnimatePresence initial={false}>
        {active && (
          <motion.span
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="block w-24 overflow-hidden text-[11px] leading-snug text-text-secondary"
          >
            {node.caption}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

function EcosystemDesktop() {
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <div className="hidden overflow-x-auto py-3 lg:block">
      <div className="mx-auto flex w-max items-start gap-1 px-1">
        {ecosystemNodes.map((node, i) => (
          <div key={node.id} className="flex items-start">
            <div className="w-24 shrink-0">
              <EcosystemNode
                node={node}
                active={activeId === node.id}
                onActivate={() => setActiveId(node.id)}
                onDeactivate={() => setActiveId((current) => (current === node.id ? null : current))}
              />
            </div>
            {i < ecosystemNodes.length - 1 && (
              <ChevronRight className="mt-4 h-4 w-4 shrink-0 text-border" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EcosystemMobileCard({ node }: { node: (typeof ecosystemNodes)[number] }) {
  const [open, setOpen] = useState(false);
  const Icon = node.icon;

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="flex h-32 w-[45%] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-3 text-center"
    >
      <span
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-xl border transition-colors duration-200",
          open ? "border-primary bg-primary/10 text-primary" : "border-border bg-bg text-text-secondary",
        )}
      >
        <Icon className="h-6 w-6" />
      </span>
      <span className="text-xs font-bold text-text">
        Panda <span className="text-primary">{node.label}</span>
      </span>
      <AnimatePresence initial={false}>
        {open && (
          <motion.span
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="block overflow-hidden text-[11px] leading-snug text-text-secondary"
          >
            {node.caption}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

function EcosystemMobile() {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 lg:hidden">
      {ecosystemNodes.map((node) => (
        <EcosystemMobileCard key={node.id} node={node} />
      ))}
    </div>
  );
}

function EcosystemDiagram() {
  return (
    <section id="ecosystem-diagram" className="scroll-mt-20 px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal className="text-center">
          <Eyebrow className="justify-center">Экосистема</Eyebrow>
          <h2 className="mt-3 text-3xl font-extrabold text-text sm:text-4xl">
            Экосистема Panda Bridge
          </h2>
        </Reveal>

        <div className="mt-12">
          <EcosystemDesktop />
          <EcosystemMobile />
        </div>
      </div>
    </section>
  );
}

export { EcosystemDiagram };
