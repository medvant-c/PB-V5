"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const DISMISSED_KEY = "dailyPlanReviewDismissedDate";

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Forced check-in, not a dismissible notice — shown once per day, the
// first time a manager opens the cabinet, reporting on yesterday's day
// plan (see daily-plan-panel.tsx): a red warning if it wasn't fully
// checked off, a green one if it was. Says nothing if nothing was planned
// at all — there's no discipline signal in an empty list either way.
// Deliberately can't be closed by clicking outside or pressing Escape
// (onPointerDownOutside/onEscapeKeyDown below) and has no × button — the
// only way out is reading it and clicking the one button. See PB-V5 chat
// 2026-07-31.
function DailyPlanReviewModal() {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState(0);
  const [fact, setFact] = useState(0);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const today = isoDate(new Date());
    if (localStorage.getItem(DISMISSED_KEY) === today) return;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    fetch(`/api/manager-daily-plan?date=${isoDate(yesterday)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const items: { doneAt: string | null }[] = data?.items ?? [];
        if (items.length === 0) return;
        const done = items.filter((i) => i.doneAt).length;
        setPlan(items.length);
        setFact(done);
        setSuccess(done === items.length);
        setOpen(true);
      })
      .catch(() => {});
  }, []);

  function handleAcknowledge() {
    localStorage.setItem(DISMISSED_KEY, isoDate(new Date()));
    setOpen(false);
  }

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className={cn("sm:max-w-sm", success ? "border-t-4 border-t-success" : "border-t-4 border-t-error")}
      >
        <div
          className={cn(
            "flex h-11.5 w-11.5 items-center justify-center rounded-2xl text-2xl",
            success ? "bg-success/15" : "bg-error/15",
          )}
        >
          {success ? "🟢" : "⚠️"}
        </div>
        <h2 className={cn("text-base font-extrabold tracking-tight", success ? "text-success" : "text-error")}>
          {success ? "Отличная работа!" : "ПЛАН НЕ ВЫПОЛНЕН"}
        </h2>
        <p className="-mt-1 text-sm leading-relaxed text-text">
          {success ? "Вчера вы выполнили план на 100%." : "Вчера вы не выполнили запланированные задачи."}
        </p>

        <div className="flex gap-2.5">
          <div className="flex-1 rounded-xl border border-border bg-bg p-3">
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-text-secondary">По плану</div>
            <div className="mt-0.5 text-2xl font-extrabold text-text">{plan}</div>
          </div>
          <div
            className={cn(
              "flex-1 rounded-xl border p-3",
              success ? "border-success/35 bg-success/5" : "border-error/35 bg-error/5",
            )}
          >
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-text-secondary">Выполнено</div>
            <div className={cn("mt-0.5 text-2xl font-extrabold", success ? "text-success" : "text-error")}>{fact}</div>
          </div>
        </div>

        <div
          className={cn(
            "flex gap-2 rounded-xl border p-3",
            success ? "border-success/30 bg-success/10" : "border-warning/30 bg-warning/10",
          )}
        >
          <span className="shrink-0 leading-snug">{success ? "✅" : "❗"}</span>
          <p className="text-xs leading-relaxed text-text">
            {success
              ? "Вы соблюдаете дисциплину и поддерживаете высокий уровень эффективности."
              : "Каждый невыполненный день — это потерянные возможности для компании, команды и вашего личного результата."}
          </p>
        </div>

        {!success && (
          <p className="text-sm leading-relaxed text-text-secondary">
            Пересмотрите свой режим работы, устраните причины невыполнения и планируйте задачи реалистично.
          </p>
        )}
        <div className="rounded-xl border border-primary/25 bg-primary/8 p-2.5 text-sm font-bold text-text">
          {success ? "Продолжайте в том же темпе!" : "Сегодня ваша цель — выполнить план на 100%."}
        </div>

        <button
          type="button"
          onClick={handleAcknowledge}
          className="w-full rounded-xl bg-gradient-to-br from-primary to-secondary py-3 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
        >
          Понятно, начинаю работать
        </button>
      </DialogContent>
    </Dialog>
  );
}

export { DailyPlanReviewModal };
