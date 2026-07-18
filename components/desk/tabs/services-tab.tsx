"use client";

import { useState } from "react";
import { Check, ChevronDown, Loader2, Sparkles } from "lucide-react";
import { pricing } from "@/data/pricing";
import { DeskFileTab } from "@/generated/prisma/enums";
import { FileUploadPanel } from "@/components/desk/file-upload-panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { deskServiceRegistry } from "@/lib/desk-services/registry";
import { DIRECTION_LABELS } from "@/lib/order-directions";
import { cn } from "@/lib/utils";

function AiServiceCard({ id: serviceId, label, inputLabel, inputPlaceholder, fileNamePrefix }: (typeof deskServiceRegistry)[number]) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    const trimmed = value.trim();
    if (!trimmed || status === "loading") return;
    setStatus("loading");
    setError(null);

    try {
      const res = await fetch("/api/desk-generate-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, input: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Не удалось сформировать отчёт. Попробуйте ещё раз.");
        setStatus("error");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileNamePrefix} — ${trimmed}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus("done");
    } catch {
      setError("Не удалось связаться с сервером.");
      setStatus("error");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-white">
          <Sparkles className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold text-text">{label}</h3>
      </div>
      <div className="mt-3 space-y-1.5">
        <label className="text-xs font-medium text-text-secondary" htmlFor={`ai-service-${serviceId}`}>
          {inputLabel}
        </label>
        <Input
          id={`ai-service-${serviceId}`}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (status !== "loading") setStatus("idle");
          }}
          onKeyDown={(event) => event.key === "Enter" && handleGenerate()}
          placeholder={inputPlaceholder}
          disabled={status === "loading"}
        />
      </div>
      {error && <p className="mt-2 text-xs text-error">{error}</p>}
      {status === "loading" && (
        <p className="mt-2 text-xs text-text-secondary">
          Обычно занимает 1–3 минуты — не закрывайте вкладку, файл скачается автоматически.
        </p>
      )}
      {status === "done" && (
        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-success">
          <Check className="h-3.5 w-3.5" /> Готово, файл скачан.
        </p>
      )}
      <Button
        type="button"
        onClick={handleGenerate}
        disabled={!value.trim() || status === "loading"}
        size="sm"
        className="mt-3 w-full"
      >
        {status === "loading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Формирую отчёт…
          </>
        ) : (
          "Выполнить услугу"
        )}
      </Button>
    </div>
  );
}

function ServicesTab() {
  const [activeDirection, setActiveDirection] = useState(pricing[0].id);
  const [openItem, setOpenItem] = useState<string | null>(null);

  const direction = pricing.find((d) => d.id === activeDirection) ?? pricing[0];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-bold text-text">Выполнить услугу с помощью AI</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Укажите нишу или товар клиента — AI подготовит согласованный отчёт в фирменном стиле Panda Bridge и
          сразу предложит скачать .docx.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {deskServiceRegistry.map((service) => (
            <AiServiceCard key={service.id} {...service} />
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <h2 className="text-sm font-bold text-text">Файлы по услугам</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Прайсы, презентации, примеры договоров — по конкретной услуге. Выберите направление, затем услугу.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {pricing.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                setActiveDirection(d.id);
                setOpenItem(null);
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                activeDirection === d.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface text-text-secondary hover:text-text",
              )}
            >
              {DIRECTION_LABELS[d.id as keyof typeof DIRECTION_LABELS] ?? d.id}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {direction.categories.map((category, categoryIndex) => (
            <div key={category.title}>
              <div className="text-xs font-semibold text-text-secondary">{category.title}</div>
              <div className="mt-1.5 space-y-1.5">
                {category.items.map((item, itemIndex) => {
                  const relatedId = `${direction.id}::${categoryIndex}::${itemIndex}`;
                  const isOpen = openItem === relatedId;
                  return (
                    <div key={relatedId} className="rounded-lg border border-border bg-surface">
                      <button
                        type="button"
                        onClick={() => setOpenItem(isOpen ? null : relatedId)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                      >
                        <span className="text-text">{item.service}</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 text-text-secondary transition-transform",
                            isOpen && "rotate-180",
                          )}
                        />
                      </button>
                      {isOpen && (
                        <div className="border-t border-border p-3">
                          <FileUploadPanel tab={DeskFileTab.services} relatedId={relatedId} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { ServicesTab };
