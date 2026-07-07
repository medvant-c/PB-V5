"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { directionsNav, mainNav, secondaryNav } from "@/data/navigation";
import { cn } from "@/lib/utils";

const destinations = [...mainNav, ...directionsNav, ...secondaryNav];

function SiteSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const normalized = query.trim().toLowerCase();
  const results = normalized
    ? destinations.filter((item) => item.label.toLowerCase().includes(normalized))
    : destinations;

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Поиск"
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-black/3"
      >
        <Search className="h-4.5 w-4.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-40 w-72 rounded-2xl border border-border bg-surface p-3 shadow-xl">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (results[0]) {
                router.push(results[0].href);
                close();
              }
            }}
            className="flex items-center gap-2 rounded-xl border border-border px-3 py-2"
          >
            <Search className="h-4 w-4 shrink-0 text-text-secondary" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по сайту..."
              className="w-full bg-transparent text-sm text-text outline-none placeholder:text-text-secondary"
            />
            {query && (
              <button
                type="button"
                aria-label="Очистить"
                onClick={() => setQuery("")}
                className="shrink-0 text-text-secondary hover:text-text"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </form>

          <div className="mt-2 max-h-64 overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-2 py-3 text-sm text-text-secondary">Ничего не найдено</p>
            ) : (
              results.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={close}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-text hover:bg-black/3",
                    )}
                  >
                    <Icon className="h-4 w-4 text-text-secondary" />
                    {item.label}
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { SiteSearch };
