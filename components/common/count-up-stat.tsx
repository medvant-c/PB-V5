"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

interface CountUpStatProps {
  value: string;
  label: string;
}

// Splits off a leading integer (e.g. "100" from "100+") so it can be counted
// up; anything without a leading number (e.g. "Поставки по всему миру") is
// rendered as-is with no animation, since there's nothing to count toward.
function CountUpStat({ value, label }: CountUpStatProps) {
  const match = value.match(/^(\d+)(.*)$/);
  const target = match ? Number(match[1]) : null;
  const suffix = match ? match[2] : value;

  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView || target === null) return;
    const duration = 1200;
    const start = performance.now();
    let frame: number;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setCount(Math.round(progress * target));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, target]);

  if (!value) {
    return (
      <div ref={ref} className="text-center text-base font-bold text-text">
        {label}
      </div>
    );
  }

  return (
    <div ref={ref} className="text-center">
      <div className="text-3xl font-extrabold text-text sm:text-4xl">
        {target !== null ? count : ""}
        {suffix}
      </div>
      <div className="mt-1 text-sm text-text-secondary">{label}</div>
    </div>
  );
}

export { CountUpStat };
