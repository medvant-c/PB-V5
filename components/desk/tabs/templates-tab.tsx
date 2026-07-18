"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Copy, Search, SearchX } from "lucide-react";
import { DeskFileTab } from "@/generated/prisma/enums";
import { FileUploadPanel } from "@/components/desk/file-upload-panel";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/desk/empty-state";
import { deskTemplateCategories, deskTemplates } from "@/data/desk-templates";
import { cn } from "@/lib/utils";

function templateKey(category: string, number: string): string {
  return `${category}::${number}`;
}

function TemplatesTab() {
  const [query, setQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set([deskTemplateCategories[0]]),
  );
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const trimmedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!trimmedQuery) return deskTemplates;
    return deskTemplates.filter(
      (t) =>
        t.title.toLowerCase().includes(trimmedQuery) ||
        t.category.toLowerCase().includes(trimmedQuery) ||
        t.when.toLowerCase().includes(trimmedQuery),
    );
  }, [trimmedQuery]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof deskTemplates>();
    for (const category of deskTemplateCategories) map.set(category, []);
    for (const template of filtered) {
      map.get(template.category)?.push(template);
    }
    return map;
  }, [filtered]);

  function toggleCategory(category: string) {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  async function copyTemplate(key: string, body: string) {
    try {
      await navigator.clipboard.writeText(body);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1500);
    } catch {
      // Clipboard permission denied or unavailable — nothing to recover into.
    }
  }

  const isSearching = trimmedQuery.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-text-secondary">
          Готовые шаблоны писем и документов — сгруппированы по этапу работы. Нажмите «Копировать», чтобы скопировать
          текст в буфер обмена.
        </p>
        <div className="relative mt-3 max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по названию или ситуации..."
            className="pl-9"
          />
        </div>

        <div className="mt-4 space-y-3">
          {deskTemplateCategories.map((category) => {
            const templates = grouped.get(category) ?? [];
            if (isSearching && templates.length === 0) return null;
            const isOpen = isSearching || expandedCategories.has(category);

            return (
              <div key={category} className="rounded-xl border border-border bg-surface">
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  disabled={isSearching}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left disabled:cursor-default"
                >
                  <span className="text-sm font-semibold text-text">
                    {category} <span className="font-normal text-text-secondary">({templates.length})</span>
                  </span>
                  {!isSearching && (
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-secondary transition-transform", isOpen && "rotate-180")} />
                  )}
                </button>

                {isOpen && templates.length > 0 && (
                  <div className="space-y-2 border-t border-border p-3">
                    {templates.map((template) => {
                      const key = templateKey(template.category, template.number);
                      const isExpanded = expandedTemplate === key;
                      return (
                        <div key={key} className="rounded-lg border border-border bg-bg">
                          <button
                            type="button"
                            onClick={() => setExpandedTemplate(isExpanded ? null : key)}
                            className="flex w-full items-start justify-between gap-3 p-3 text-left"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-text-secondary">{template.number}</div>
                              <div className="text-sm font-medium text-text">{template.title}</div>
                              <div className="mt-0.5 text-xs text-text-secondary">Когда: {template.when}</div>
                            </div>
                            <ChevronDown
                              className={cn(
                                "mt-1 h-4 w-4 shrink-0 text-text-secondary transition-transform",
                                isExpanded && "rotate-180",
                              )}
                            />
                          </button>
                          {isExpanded && (
                            <div className="border-t border-border p-3">
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => copyTemplate(key, template.body)}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
                                >
                                  {copiedKey === key ? (
                                    <>
                                      <Check className="h-3.5 w-3.5" /> Скопировано
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3.5 w-3.5" /> Копировать
                                    </>
                                  )}
                                </button>
                              </div>
                              <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-dashed border-border bg-surface p-2.5 font-mono text-[11.5px] leading-relaxed text-text-secondary">
                                {template.body}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {isSearching && filtered.length === 0 && (
            <EmptyState icon={SearchX} message="По этому запросу ничего не нашлось — попробуйте другое слово." compact />
          )}
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <p className="text-sm text-text-secondary">
          Файлы шаблонов для скачивания (DOCX, PDF) — договоры, презентации и другие документы.
        </p>
        <div className="mt-3">
          <FileUploadPanel tab={DeskFileTab.templates} relatedId={null} />
        </div>
      </div>
    </div>
  );
}

export { TemplatesTab };
