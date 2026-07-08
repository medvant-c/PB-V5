"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

interface RevealProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}

// Fades content in with a small upward shift the first time it enters the
// viewport. `viewport={{ once: true }}` is what keeps it from re-triggering
// on scroll-up/down; `MotionConfig reducedMotion="user"` in AppShell makes
// framer-motion collapse this to an instant, transform-free fade for anyone
// with reduced motion enabled, so no per-component fallback is needed here.
function Reveal({ children, delay = 0, className, y = 16 }: RevealProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export { Reveal };
