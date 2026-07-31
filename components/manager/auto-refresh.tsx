"use client";

import { useEffect } from "react";

const REFRESH_INTERVAL_MS = 8 * 60 * 60 * 1000;

// This is a client-rendered SPA — switching between manager-cabinet tabs
// (Клиенты/Тарифы/etc.) never triggers a real page load, so a manager who
// leaves the same browser tab open overnight keeps running yesterday's
// already-loaded JS indefinitely unless they manually refresh. That
// matters specifically because DailyPlanReviewModal's yesterday check-in
// only runs once, on mount — an open tab would otherwise never show it.
// Force-reloads roughly every 8 hours to guarantee a stale tab eventually
// picks up the new day. Reloads immediately if the tab is already in the
// background when the timer fires; otherwise waits for it to actually go
// into the background first, so an active work session is never
// interrupted mid-task. See PB-V5 chat 2026-07-31.
function AutoRefresh() {
  useEffect(() => {
    const timer = setTimeout(() => {
      if (document.hidden) {
        window.location.reload();
        return;
      }
      const onHidden = () => {
        if (!document.hidden) return;
        document.removeEventListener("visibilitychange", onHidden);
        window.location.reload();
      };
      document.addEventListener("visibilitychange", onHidden);
    }, REFRESH_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, []);

  return null;
}

export { AutoRefresh };
