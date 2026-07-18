"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { DeskFileTab } from "@/generated/prisma/enums";
import { FileUploadPanel } from "@/components/desk/file-upload-panel";
import { cn } from "@/lib/utils";

// Starter modules ported from the reference desk mockup (panda-bridge-desk.html) —
// illustrative starting content for the training catalog; replace/extend with
// real course data as it becomes available. No completion count here on
// purpose — see the "Отметить как пройден" toggle below for why.
const MODULES = [
  {
    id: "ved-basics",
    title: "Основы ВЭД для новых менеджеров",
    description: "От первого запроса клиента до закрытия сделки.",
  },
  {
    id: "china-suppliers",
    title: "Работа с поставщиками из Китая",
    description: "Переговоры, культурные особенности, типовые схемы обмана.",
  },
  {
    id: "customs-2026",
    title: "Таможенное законодательство: обновления 2026",
    description: "Изменения в тарифах и порядке декларирования.",
  },
  {
    id: "crm-work",
    title: "Работа в CRM и Panda Bridge",
    description: "Как вести карточку клиента и сделки без потери данных.",
  },
];

// A per-browser personal checklist, not a company-wide progress tracker —
// the desk has no individual manager accounts to attach real completion
// data to, and a fabricated percentage (the previous version of this tab)
// is worse than no number at all. Deliberately scoped to what's honestly
// achievable without adding manager identity/auth.
const PROGRESS_STORAGE_KEY = "desk-training-progress";

function loadCompletedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function TrainingTab() {
  const [openModule, setOpenModule] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setCompletedIds(loadCompletedIds());
  }, []);

  function toggleCompleted(moduleId: string) {
    setCompletedIds((current) => {
      const next = new Set(current);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Материалы и курсы для менеджеров. Отметка «Пройдено» — личный чек-лист в этом браузере, не общий трекер
        компании.
      </p>

      <div className="space-y-3">
        {MODULES.map((module) => {
          const isOpen = openModule === module.id;
          const isCompleted = completedIds.has(module.id);
          return (
            <div key={module.id} className="rounded-xl border border-border bg-surface">
              <div className="flex items-start justify-between gap-3 p-4">
                <button
                  type="button"
                  onClick={() => setOpenModule(isOpen ? null : module.id)}
                  className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-text">{module.title}</h3>
                    <p className="mt-1 text-xs text-text-secondary">{module.description}</p>
                  </div>
                  <ChevronDown
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0 text-text-secondary transition-transform",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleCompleted(module.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    isCompleted
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-border text-text-secondary hover:border-primary/30 hover:text-primary",
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                  {isCompleted ? "Пройдено вами" : "Отметить как пройден"}
                </button>
              </div>
              {isOpen && (
                <div className="border-t border-border p-4">
                  <FileUploadPanel tab={DeskFileTab.training} relatedId={module.id} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { TrainingTab };
