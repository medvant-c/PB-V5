"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const POLL_INTERVAL_MS = 30 * 1000;

interface AssignedItem {
  id: string;
  note: string;
  client: { id: string; name: string; company: string | null } | null;
  quoteDraftRequest: { id: string; displayId: number } | null;
  assignedByManagerName: string | null;
  createdAt: string;
}

// Pop-up shown the moment a manager is online after an owner/senior puts a
// task on their plan (DailyPlanItem.assignedByManagerId) — polled, not tied
// to page load, since this is a client-rendered SPA that can sit open for
// hours (see auto-refresh.tsx). Purely an overlay: never reloads the page
// or touches any other component's state, so whatever the manager is
// mid-typing elsewhere (a quote, a client edit, anything) is untouched —
// the only way out is reading the task and clicking the one button, same
// "forced but non-destructive" pattern as daily-plan-review-modal.tsx.
// Queues items one at a time if several arrived while offline. See PB-V5
// chat 2026-08-03.
function DailyPlanAssignedModal() {
  const [queue, setQueue] = useState<AssignedItem[]>([]);
  const [acking, setAcking] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function poll() {
      fetch("/api/manager-daily-plan/unacknowledged")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          // Always replaced wholesale, never merged — the server is the
          // single source of truth for "still unacknowledged," so an item
          // acknowledged from another tab (or reverted) drops out of the
          // queue on the very next tick instead of lingering locally.
          setQueue(data.items ?? []);
        })
        .catch(() => {});
    }

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const current = queue[0] ?? null;

  async function handleAcknowledge() {
    if (!current || acking) return;
    setAcking(true);
    try {
      await fetch(`/api/manager-daily-plan/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledged: true }),
      });
      setQueue((q) => q.filter((i) => i.id !== current.id));
    } finally {
      setAcking(false);
    }
  }

  if (!current) return null;

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="border-t-4 border-t-primary sm:max-w-sm"
      >
        <div className="flex h-11.5 w-11.5 items-center justify-center rounded-2xl bg-primary/15 text-2xl">🎯</div>
        <h2 className="text-base font-extrabold tracking-tight text-primary">Новая задача от {current.assignedByManagerName ?? "руководителя"}</h2>

        <div className="rounded-xl border border-border bg-bg p-3 text-sm">
          {current.client && (
            <p className="text-xs font-semibold text-text-secondary">
              Клиент: <span className="text-text">{current.client.name}{current.client.company ? ` (${current.client.company})` : ""}</span>
            </p>
          )}
          {current.quoteDraftRequest && (
            <p className="text-xs font-semibold text-text-secondary">Черновик №{current.quoteDraftRequest.displayId}</p>
          )}
          <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-text">{current.note}</p>
        </div>

        {queue.length > 1 && (
          <p className="text-xs text-text-secondary">И ещё {queue.length - 1} после этой — покажутся по очереди.</p>
        )}

        <button
          type="button"
          onClick={handleAcknowledge}
          disabled={acking}
          className="w-full rounded-xl bg-gradient-to-br from-primary to-secondary py-3 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
        >
          Понятно, принято к исполнению
        </button>
      </DialogContent>
    </Dialog>
  );
}

export { DailyPlanAssignedModal };
