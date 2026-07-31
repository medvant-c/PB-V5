"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Loader2, ListChecks, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlanItem {
  id: string;
  note: string;
  doneAt: string | null;
  client: { id: string; name: string; company: string | null } | null;
  quoteDraftRequest: { id: string; displayId: number } | null;
  assignedByManagerName: string | null;
}

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
}

interface DraftOption {
  id: string;
  displayId: number;
  note: string;
  client: { id: string; name: string; company: string | null };
}

type AddMode = "client" | "draft" | "note";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Sticky, collapsible "day plan" widget — fixed-position, visible from any
// tab in the manager cabinet without pushing that tab's own content down
// (see PB-V5 chat 2026-07-31). Purely personal: every manager (including
// the owner) manages only their own list here; the owner/senior's
// cross-manager read-only view is a separate dashboard block
// (manager-daily-plan-summary).
function DailyPlanPanel() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [drafts, setDrafts] = useState<DraftOption[]>([]);
  const [addMode, setAddMode] = useState<AddMode>("client");
  const [clientPick, setClientPick] = useState("");
  const [clientTask, setClientTask] = useState("");
  const [draftPick, setDraftPick] = useState("");
  const [noteText, setNoteText] = useState("");
  const [adding, setAdding] = useState(false);

  function load() {
    setLoading(true);
    return fetch(`/api/manager-daily-plan?date=${todayIso()}`)
      .then((res) => res.json())
      .then((data) => setItems(data.items ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!open) return;
    if (clients.length === 0) {
      fetch("/api/manager-clients")
        .then((res) => res.json())
        .then((data) => setClients(data.clients ?? []));
    }
    if (drafts.length === 0) {
      fetch("/api/manager-quote-drafts")
        .then((res) => res.json())
        .then((data) => setDrafts(data.drafts ?? []));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetched once, first time the panel opens
  }, [open]);

  async function handleToggleDone(item: PlanItem) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/manager-daily-plan/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !item.doneAt }),
      });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/manager-daily-plan/${id}`, { method: "DELETE" });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleAdd() {
    let payload: { note: string; clientId?: string; quoteDraftRequestId?: string } | null = null;

    if (addMode === "client") {
      const client = clients.find((c) => c.id === clientPick);
      if (!client) {
        setError("Выберите клиента.");
        return;
      }
      const clientLabel = client.company ? `${client.name} (${client.company})` : client.name;
      // "Клиент — задача" when a task was typed, so the to-do list itself
      // says what to actually do for them, not just who — same reasoning
      // as the draft/note modes always carrying their own description.
      // Falls back to just the client name if left blank (fast path for
      // "just remind me to deal with them today").
      payload = { note: clientTask.trim() ? `${clientLabel} — ${clientTask.trim()}` : clientLabel, clientId: client.id };
    } else if (addMode === "draft") {
      const draft = drafts.find((d) => d.id === draftPick);
      if (!draft) {
        setError("Выберите черновик.");
        return;
      }
      payload = { note: draft.note, clientId: draft.client.id, quoteDraftRequestId: draft.id };
    } else {
      if (!noteText.trim()) {
        setError("Напишите, что запланировано.");
        return;
      }
      payload = { note: noteText.trim() };
    }

    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/manager-daily-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, date: todayIso() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Не удалось добавить пункт.");
        return;
      }
      setClientPick("");
      setClientTask("");
      setDraftPick("");
      setNoteText("");
      await load();
    } finally {
      setAdding(false);
    }
  }

  const total = items.length;
  const done = items.filter((i) => i.doneAt).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="fixed bottom-5 right-5 z-40 w-90 max-w-[calc(100vw-2.5rem)] text-sm">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ml-auto flex items-center gap-2.5 rounded-full border border-border bg-surface py-2 pr-4 pl-2 shadow-lg transition-transform hover:-translate-y-0.5"
        >
          <span
            className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(var(--color-primary) ${pct}%, color-mix(in srgb, var(--color-border) 80%, transparent) 0)`,
            }}
          >
            <span className="flex h-5.5 w-5.5 items-center justify-center rounded-full bg-surface">
              <ListChecks className="h-3 w-3 text-primary" />
            </span>
          </span>
          <span className="text-left">
            <span className="block text-xs font-bold text-text">План на сегодня</span>
            <span className="block text-[11px] font-medium text-text-secondary">
              {total === 0 ? "пока пусто" : `${done} из ${total} выполнено`}
            </span>
          </span>
        </button>
      ) : (
        <div className="flex max-h-[74vh] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-primary/9 via-secondary/7 to-primary/9 px-4 py-3">
            <div className="flex items-baseline gap-2">
              <strong className="text-sm text-text">План на сегодня</strong>
              <span className="text-xs text-text-secondary">{done} из {total}</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-black/5 hover:text-text"
              aria-label="Свернуть"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-1 overflow-y-auto p-2.5">
            {loading ? (
              <p className="p-2 text-xs text-text-secondary">Загрузка…</p>
            ) : items.length === 0 ? (
              <p className="p-2 text-xs text-text-secondary">Пока ничего не запланировано — добавьте пункт ниже.</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="group flex items-start gap-2.5 rounded-xl px-1.5 py-2 hover:bg-black/[0.03]">
                  <button
                    type="button"
                    onClick={() => handleToggleDone(item)}
                    disabled={busyId === item.id}
                    className={cn(
                      "mt-0.5 flex h-4.75 w-4.75 shrink-0 items-center justify-center rounded-md border transition-colors",
                      item.doneAt ? "border-success bg-success" : "border-border bg-surface hover:border-primary/50",
                    )}
                    aria-label={item.doneAt ? "Отметить невыполненным" : "Отметить выполненным"}
                  >
                    {item.doneAt && <Check className="h-3 w-3 text-white" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                          item.quoteDraftRequest
                            ? "bg-warning/15 text-warning"
                            : item.client
                              ? "bg-primary/10 text-primary"
                              : "bg-text-secondary/15 text-text-secondary",
                        )}
                      >
                        {item.quoteDraftRequest ? "черновик" : item.client ? "клиент" : "заметка"}
                      </span>
                      {item.assignedByManagerName && (
                        <span className="rounded-full bg-secondary/15 px-1.5 py-0.5 text-[10px] font-bold text-secondary">
                          🎯 от {item.assignedByManagerName}
                        </span>
                      )}
                      <span className={cn("text-xs font-semibold text-text", item.doneAt && "text-text-secondary line-through")}>
                        {item.note}
                      </span>
                    </div>
                    {item.quoteDraftRequest && (
                      <p className="mt-0.5 text-[11px] text-text-secondary">черновик №{item.quoteDraftRequest.displayId}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    disabled={busyId === item.id}
                    className="shrink-0 rounded-md p-1 text-text-secondary opacity-0 transition-opacity hover:bg-error/10 hover:text-error group-hover:opacity-100"
                    aria-label="Удалить"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}

            <div className="mt-2 border-t border-border pt-2.5">
              <div className="flex gap-1 rounded-lg border border-border bg-bg p-0.5">
                {(
                  [
                    ["client", "Клиент"],
                    ["draft", "Черновик"],
                    ["note", "Заметка"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setAddMode(mode)}
                    className={cn(
                      "flex-1 rounded-md py-1.5 text-[11px] font-semibold transition-colors",
                      addMode === mode ? "bg-surface text-primary shadow-sm" : "text-text-secondary hover:text-text",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {addMode === "client" && (
                <div className="mt-2 space-y-1.5">
                  <select
                    value={clientPick}
                    onChange={(e) => setClientPick(e.target.value)}
                    className="h-8 w-full rounded-lg border border-border bg-surface px-2 text-xs text-text"
                  >
                    <option value="">Выберите клиента…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.company ? ` (${c.company})` : ""}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={clientTask}
                      onChange={(e) => setClientTask(e.target.value)}
                      placeholder="Что сделать для этого клиента (необязательно)"
                      className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 text-xs text-text"
                    />
                    <button
                      type="button"
                      onClick={handleAdd}
                      disabled={adding}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-white disabled:opacity-50"
                      aria-label="Добавить"
                    >
                      {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
              {addMode !== "client" && (
                <div className="mt-2 flex gap-1.5">
                  {addMode === "draft" && (
                    <select
                      value={draftPick}
                      onChange={(e) => setDraftPick(e.target.value)}
                      className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-xs text-text"
                    >
                      <option value="">Выберите черновик…</option>
                      {drafts.map((d) => (
                        <option key={d.id} value={d.id}>
                          №{d.displayId} · {d.client.name} · {d.note.slice(0, 40)}
                        </option>
                      ))}
                    </select>
                  )}
                  {addMode === "note" && (
                    <input
                      type="text"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Например: клиент ещё не в базе, напишет вечером…"
                      className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 text-xs text-text"
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={adding}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-white disabled:opacity-50"
                    aria-label="Добавить"
                  >
                    {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </button>
                </div>
              )}
              {error && <p className="mt-1.5 text-[11px] text-error">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { DailyPlanPanel };
