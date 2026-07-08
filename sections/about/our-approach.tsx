"use client";

import { motion } from "framer-motion";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Reveal } from "@/components/common/reveal";
import { Eyebrow } from "@/components/ui/eyebrow";

const steps = [
  "Идея",
  "Исследование рынка",
  "Поиск товара",
  "Поиск фабрики",
  "Переговоры",
  "Производство",
  "Контроль качества",
  "Логистика",
  "Склад",
  "Маркетплейсы",
  "Рост бизнеса",
];

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

function OurApproach() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <Reveal className="text-center">
          <Eyebrow className="justify-center">Как мы работаем</Eyebrow>
          <h2 className="mt-3 text-3xl font-extrabold text-text sm:text-4xl">Наш подход</h2>
        </Reveal>

        {/* Desktop: wraps into a zigzag of rows across the container */}
        <motion.div
          className="mt-12 hidden flex-wrap items-center justify-center gap-x-2 gap-y-6 md:flex"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
        >
          {steps.map((step, i) => (
            <motion.div key={step} variants={itemVariants} className="flex items-center gap-2">
              <span className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-text whitespace-nowrap">
                {step}
              </span>
              {i < steps.length - 1 && <ArrowRight className="h-4 w-4 shrink-0 text-border" />}
            </motion.div>
          ))}
        </motion.div>

        {/* Mobile: vertical list with a down-arrow between steps */}
        <motion.div
          className="mt-10 flex flex-col items-center gap-2 md:hidden"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
        >
          {steps.map((step, i) => (
            <motion.div key={step} variants={itemVariants} className="flex flex-col items-center gap-2">
              <span className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-text">
                {step}
              </span>
              {i < steps.length - 1 && <ChevronDown className="h-4 w-4 shrink-0 text-border" />}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

export { OurApproach };
