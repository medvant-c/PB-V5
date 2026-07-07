"use client";

import { useLanguage, type Language } from "@/components/common/language-context";
import { cn } from "@/lib/utils";

const languages: Language[] = ["RU", "EN"];

function LanguageSwitcher({ className }: { className?: string }) {
  const { language, setLanguage } = useLanguage();

  return (
    <div className={cn("inline-flex items-center gap-1 rounded-lg bg-black/4 p-1", className)}>
      {languages.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLanguage(code)}
          className={cn(
            "rounded-md px-2.5 py-1 text-sm font-semibold transition-colors",
            language === code
              ? "bg-surface text-text shadow-sm"
              : "text-text-secondary hover:text-text",
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}

export { LanguageSwitcher };
