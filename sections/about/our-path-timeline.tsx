"use client";

import { motion } from "framer-motion";
import { Reveal } from "@/components/common/reveal";
import { Eyebrow } from "@/components/ui/eyebrow";

const milestones = [
  { year: "2026", title: "Основание Panda Bridge" },
  { title: "Создание экосистемы" },
  { title: "Запуск первых клиентов" },
  { title: "Открытие офиса в Китае" },
  { title: "Разработка Panda AI" },
  { title: "Разработка HUB OS" },
  { title: "Международное развитие" },
];

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

function OurPathTimeline() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="text-center">
          <Eyebrow className="justify-center">История</Eyebrow>
          <h2 className="mt-3 text-3xl font-extrabold text-text sm:text-4xl">Наш путь</h2>
        </Reveal>

        {/* Desktop: horizontal timeline, connecting line draws left-to-right */}
        <motion.div
          className="relative mt-16 hidden md:flex"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
        >
          <motion.div
            className="absolute top-2.5 right-0 left-0 h-px origin-left bg-border"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
          {milestones.map((item) => (
            <motion.div key={item.title} variants={itemVariants} className="flex flex-1 flex-col items-center text-center">
              <span className="z-10 h-5 w-5 shrink-0 rounded-full border-4 border-bg bg-primary" />
              {item.year && <span className="mt-3 text-xs font-bold text-primary">{item.year}</span>}
              <span className="mt-1 max-w-28 text-sm font-medium text-text">{item.title}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Mobile: vertical timeline, connecting line draws top-to-bottom */}
        <motion.div
          className="relative mt-10 pl-8 md:hidden"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
        >
          <motion.div
            className="absolute top-1 bottom-1 left-2.5 w-px origin-top bg-border"
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
          <div className="flex flex-col gap-7">
            {milestones.map((item) => (
              <motion.div key={item.title} variants={itemVariants} className="relative">
                <span className="absolute top-1 -left-8 h-5 w-5 rounded-full border-4 border-bg bg-primary" />
                {item.year && <span className="block text-xs font-bold text-primary">{item.year}</span>}
                <span className="text-sm font-medium text-text">{item.title}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export { OurPathTimeline };
