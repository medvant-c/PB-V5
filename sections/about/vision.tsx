"use client";

import { CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { Reveal } from "@/components/common/reveal";

const checklist = [
  "Производство",
  "Поиск товара",
  "Проверка фабрики",
  "Логистика",
  "Склад",
  "Маркетплейсы",
  "Обучение",
  "Искусственный интеллект",
];

function Vision() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl">
        <Reveal className="text-center">
          <h2 className="text-2xl font-extrabold text-text sm:text-3xl">Наше видение</h2>
          <p className="mt-4 text-base text-text-secondary sm:text-lg">
            Мы строим крупнейшую русскоязычную экосистему для работы с Китаем. Где предприниматель
            сможет найти всё в одном месте:
          </p>
        </Reveal>

        <motion.ul
          className="mx-auto mt-8 grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-2"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.09 } } }}
        >
          {checklist.map((item) => (
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

export { Vision };
