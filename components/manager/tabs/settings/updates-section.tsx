"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, History, Loader2, RotateCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ChangelogEntry {
  date: string;
  title: string;
  description: string;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

const ROLLBACK_CONFIRM_SECONDS = 30;

// Owner-only — what changed and when (see changelog.json, hand-curated
// alongside each shipped feature), plus a last-resort "откат" to the
// commit scripts/deploy.sh recorded right before its own last run (see
// scripts/rollback.sh / POST /api/manager-system-rollback). The 30-second
// disabled countdown on the confirm button is deliberate friction — a
// rollback can't be undone, so there's no fast path to clicking it by
// habit. See PB-V5 chat 2026-08-01.
function ManagerUpdatesTab() {
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(ROLLBACK_CONFIRM_SECONDS);
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [rollbackStarted, setRollbackStarted] = useState(false);

  useEffect(() => {
    fetch("/api/manager-system-changelog")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setEntries(data?.entries ?? []));
  }, []);

  useEffect(() => {
    if (!dialogOpen) return;
    setSecondsLeft(ROLLBACK_CONFIRM_SECONDS);
    const timer = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [dialogOpen]);

  async function handleRollback() {
    setRollingBack(true);
    setRollbackError(null);
    try {
      const res = await fetch("/api/manager-system-rollback", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setRollbackError(data.error ?? "Не удалось запустить откат.");
        return;
      }
      setRollbackStarted(true);
      setDialogOpen(false);
    } catch {
      setRollbackError("Не удалось связаться с сервером.");
    } finally {
      setRollingBack(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-bold text-text">Обновления</h2>
        <p className="mt-1 text-sm text-text-secondary">История того, что менялось в системе, и откат к предыдущей версии на крайний случай.</p>
      </div>

      <div className="rounded-2xl border border-error/30 bg-error/5 p-4 sm:p-5">
        <div className="flex items-center gap-1.5 text-sm font-bold text-text">
          <RotateCcw className="h-4 w-4 text-error" /> Откат к предыдущей версии
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
          Возвращает систему к состоянию перед последним обновлением. Используйте, только если после обновления что-то
          явно сломалось.
        </p>

        {rollbackStarted ? (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-xs font-medium text-text">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Откат запущен — система обновится за
            30–60 секунд, вкладка сама предложит обновиться.
          </p>
        ) : (
          <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="mt-3 flex items-center gap-1.5 rounded-lg border border-error/40 bg-surface px-3 py-1.5 text-xs font-semibold text-error transition-colors hover:bg-error/10"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Откатить к предыдущей версии
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-error" /> Вы точно уверены?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Система вернётся к состоянию перед последним обновлением. Нажимая «Да» — вернуться назад к текущей
                  версии будет невозможно.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction variant="danger" disabled={secondsLeft > 0 || rollingBack} onClick={handleRollback}>
                  {rollingBack && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {secondsLeft > 0 ? `Да, откатить (${secondsLeft})` : "Да, откатить"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {rollbackError && <p className="mt-2 text-xs text-error">{rollbackError}</p>}
      </div>

      <div>
        <div className="flex items-center gap-1.5 text-sm font-bold text-text">
          <History className="h-4 w-4 text-text-secondary" /> История изменений
        </div>
        {!entries ? (
          <p className="mt-2 text-xs text-text-secondary">Загрузка…</p>
        ) : entries.length === 0 ? (
          <p className="mt-2 text-xs text-text-secondary">Пока пусто.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {entries.map((entry, i) => (
              <li key={i} className="rounded-xl border border-border bg-surface p-3.5">
                <div className="text-xs text-text-secondary">{formatDate(entry.date)}</div>
                <div className="mt-0.5 text-sm font-bold text-text">{entry.title}</div>
                <p className="mt-1 text-xs leading-relaxed text-text-secondary">{entry.description}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export { ManagerUpdatesTab };
