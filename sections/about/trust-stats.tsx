"use client";

import { CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { VERIFIED_FACTORIES_COUNT } from "@/data/stats";
import { CountUpStat } from "@/components/common/count-up-stat";
import { Reveal } from "@/components/common/reveal";
import { Eyebrow } from "@/components/ui/eyebrow";

// Real counted facts only — CountUpStat expects a number.
const stats = [
  { value: "100+", label: "реализованных проектов" },
  { value: VERIFIED_FACTORIES_COUNT, label: "проверенных фабрик" },
];

// Capabilities, not counts — "worldwide delivery" or "own QC process" has no
// number to show. These used to be forced into the stat-tile format with an
// empty value; a checklist is the honest shape for a yes/no claim.
const capabilities = ["Поставки по всему миру", "Собственные процессы контроля качества", "Сопровождение на русском языке"];

function TrustStats() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Reveal className="text-center">
          <Eyebrow className="justify-center">Доверие</Eyebrow>
          <h2 className="mt-3 text-3xl font-extrabold text-text sm:text-4xl">Почему нам доверяют</h2>
        </Reveal>

        <div className="mx-auto mt-10 grid max-w-md grid-cols-2 gap-8">
          {stats.map((stat) => (
            <CountUpStat key={stat.label} value={stat.value} label={stat.label} />
          ))}
        </div>

        <motion.ul
          className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.09 } } }}
        >
          {capabilities.map((item) => (
            <motion.li
              key={item}
              className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3"
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
              }}
            >
              <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-success" />
              <span className="text-sm font-medium text-text">{item}</span>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}

export { TrustStats };
