"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchableSelectOption {
  value: string;
  label: string;
  // Что реально ищется, если отличается от того, что показывается (напр.
  // "Иванов (ООО Ромашка)" для поиска, когда label — просто "Иванов").
  searchText?: string;
}

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  // Пункт "Все ..." всегда закреплён сверху, значение "all", не участвует
  // в фильтрации по поиску.
  allLabel: string;
  className?: string;
  searchPlaceholder?: string;
}

// Как Select, но со строкой поиска сверху списка — для длинных списков
// (клиенты, менеджеры), где просто листать пункты неудобно. Свой Popover +
// Input вместо cmdk/Command (в проекте не установлен), тот же визуальный
// стиль, что и у остальных выпадающих меню в manager-кабинете. См. PB-V5
// chat 2026-08-08.
function SearchableSelect({ value, onValueChange, options, allLabel, className, searchPlaceholder = "Поиск…" }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedLabel = value === "all" ? allLabel : (options.find((o) => o.value === value)?.label ?? allLabel);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => (o.searchText ?? o.label).toLowerCase().includes(q));
  }, [options, search]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none hover:bg-bg focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            className,
          )}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-text-secondary" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 pl-7 text-sm"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          <button
            type="button"
            onClick={() => {
              onValueChange("all");
              setOpen(false);
            }}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-text transition-colors hover:bg-bg"
          >
            <span className="truncate">{allLabel}</span>
            {value === "all" && <Check className="h-4 w-4 shrink-0 text-primary" />}
          </button>
          {filtered.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-text-secondary">Ничего не найдено.</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onValueChange(o.value);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-text transition-colors hover:bg-bg"
              >
                <span className="truncate">{o.label}</span>
                {value === o.value && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { SearchableSelect };
export type { SearchableSelectOption };
