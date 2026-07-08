"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home } from "lucide-react";
import { cn } from "@/lib/utils";

function BackToHomeButton() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const isHome = pathname === "/";

  useEffect(() => {
    const nearBottomThreshold = 160;

    const handleScroll = () => {
      const scrolledPastHalfScreen = window.scrollY > window.innerHeight * 0.5;
      const distanceToBottom =
        document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      setVisible(scrolledPastHalfScreen && distanceToBottom > nearBottomThreshold);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  if (!visible) return null;

  const className = cn(
    "fixed right-5 bottom-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-text text-white opacity-45 shadow-lg transition-opacity duration-200 hover:opacity-100 focus-visible:opacity-100 active:opacity-100",
  );

  if (isHome) {
    return (
      <button
        type="button"
        aria-label="Прокрутить наверх"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={className}
      >
        <Home className="h-5 w-5" />
      </button>
    );
  }

  return (
    <Link href="/" aria-label="На главный экран" className={className}>
      <Home className="h-5 w-5" />
    </Link>
  );
}

export { BackToHomeButton };
