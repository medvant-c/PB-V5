"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

const POLL_INTERVAL_MS = 15 * 1000;

type Phase = "idle" | "deploying" | "ready";

// Polls scripts/deploy.sh's status file (via /api/manager-system-status)
// so an open tab notices a server-side deploy instead of managers just
// hitting occasional failed requests during the moment pm2 actually
// restarts. Deliberately never force-reloads an active tab — losing
// whatever someone is mid-typing to an unannounced reload is worse than a
// stale tab for a few minutes. Only offers a manual "Обновить" button,
// plus the same "wait until the tab is backgrounded, then reload"
// fallback AutoRefresh already uses elsewhere in this cabinet — so an
// update is picked up automatically eventually without ever interrupting
// active work. See PB-V5 chat 2026-08-01.
function DeploymentWatcher() {
  const [phase, setPhase] = useState<Phase>("idle");
  const knownVersionRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/manager-system-status");
        if (!res.ok) throw new Error("bad status");
        const data: { status: string; version: string } = await res.json();
        if (cancelled) return;

        // First successful poll just establishes the baseline — nothing
        // to announce yet, whatever version this tab already loaded with.
        if (knownVersionRef.current === null) {
          knownVersionRef.current = data.version;
          return;
        }

        if (data.status === "deploying") {
          setPhase("deploying");
        } else if (data.version && data.version !== knownVersionRef.current) {
          setPhase("ready");
        } else {
          setPhase((current) => (current === "ready" ? current : "idle"));
        }
      } catch {
        // A failed poll — most likely the instant pm2 actually restarts —
        // reads the same as "deploying"; self-heals on the next successful
        // poll either way, no separate handling needed.
        if (!cancelled) setPhase((current) => (current === "ready" ? current : "deploying"));
      }
    }

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
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
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [phase]);

  if (phase === "idle") return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3">
      {phase === "deploying" ? (
        <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-medium text-text-secondary shadow-lg">
          <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
          Идёт обновление системы — можно продолжать работать, вкладка сама предложит обновиться
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary shadow-lg">
          Обновление выполнено
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="shrink-0 rounded-full bg-primary px-3 py-1 text-white transition-colors hover:bg-primary/90"
          >
            Обновить страницу
          </button>
        </div>
      )}
    </div>
  );
}

export { DeploymentWatcher };
