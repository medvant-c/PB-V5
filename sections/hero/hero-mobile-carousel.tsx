"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MobileHeroCarouselProps {
  children: ReactNode;
}

function MobileHeroCarousel({ children }: MobileHeroCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const items = Children.toArray(children);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const cardEls = Array.from(track.children) as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!mostVisible) return;
        const index = cardEls.indexOf(mostVisible.target as HTMLElement);
        if (index !== -1) setActiveIndex(index);
      },
      { root: track, threshold: [0.5, 0.75, 1] },
    );

    cardEls.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items.length]);

  return (
    <div className="mt-8 min-[1400px]:hidden">
      <div
        ref={trackRef}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {items}
      </div>

      <div className="mt-4 flex justify-center gap-1.5">
        {items.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === activeIndex ? "w-4 bg-primary" : "w-1.5 bg-border",
            )}
          />
        ))}
      </div>
    </div>
  );
}

export { MobileHeroCarousel };
