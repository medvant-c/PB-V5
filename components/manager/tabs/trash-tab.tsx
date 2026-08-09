"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/desk/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TrashedQuote {
  id: string;
  displayId: number;
  productName: string;
  totalRub: string;
  deletedAt: string;
  purgeAt: string;
  deletedByManager: { name: string } | null;
  manager: { name: string };
  client: { name: string; company: string | null };
}

function fmtRub(value: string): string {
  return Math.round(Number(value)).toLocaleString("ru-RU");
}

function fmtDate(value: string): string {
  return new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function daysLeft(purgeAt: string): number {
  return Math.max(0, Math.ceil((new Date(purgeAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

// Owner-only, both viewing and restoring — see app/api/manager-quotes/trash
// and .../[id]/restore. Every quote here still exists in the database
// (Quote.deletedAt set, not actually removed) for up to 14 days, after
// which scripts/purge-deleted-quotes.ts removes it for good. See PB-V5
// chat 2026-08-04.
function ManagerTrashTab() {
  const [quotes, setQuotes] = useState<TrashedQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Поиск по названию/номеру/клиенту + фильтр по менеджеру — список менеджеров
  // берём из самих удалённых просчётов (не отдельным запросом), поскольку
  // корзина и так уже владелец видит целиком. См. PB-V5 chat 2026-08-08.
  const [searchQuery, setSearchQuery] = useState("");
  const [managerFilter, setManagerFilter] = useState("all");
  const managers = useMemo(() => {
    const byName = new Map<string, string>();
    for (const q of quotes) byName.set(q.manager.name, q.manager.name);
    return [...byName.values()].sort((a, b) => a.localeCompare(b, "ru"));
  }, [quotes]);
  const filteredQuotes = quotes.filter((q) => {
    if (managerFilter !== "all" && q.manager.name !== managerFilter) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      q.productName.toLowerCase().includes(query) ||
      String(q.displayId).includes(query) ||
      q.client.name.toLowerCase().includes(query) ||
      (q.client.company ?? "").toLowerCase().includes(query)
    );
  });

  const load = useCallback(() => {
    setLoading(true);
    return fetch("/api/manager-quotes/trash")
      .then((res) => res.json())
      .then((data) => setQuotes(data.quotes ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRestore(id: string) {
    setRestoringId(id);
    setError(null);
    try {
      const res = await fetch(`/api/manager-quotes/${id}/restore`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Не удалось восстановить просчёт.");
        return;
      }
      await load();
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-text">Корзина</h2>
        <p className="mt-1 text-xs text-text-secondary">
          Удалённые просчёты хранятся здесь 14 дней и могут быть восстановлены, затем удаляются безвозвратно.
        </p>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      {quotes.length > 5 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по названию, номеру или клиенту…"
            className="w-full sm:w-72"
          />
          {managers.length > 1 && (
            <Select value={managerFilter} onValueChange={setManagerFilter}>
              <SelectTrigger className="w-full sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все менеджеры</SelectItem>
                {managers.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(searchQuery || managerFilter !== "all") && (
            <span className="text-xs text-text-secondary">
              Найдено: {filteredQuotes.length} из {quotes.length}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-secondary">Загрузка…</p>
      ) : quotes.length === 0 ? (
        <EmptyState icon={Trash2} message="Корзина пуста." />
      ) : filteredQuotes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-text-secondary">
          Ничего не найдено — попробуйте изменить запрос или сбросить фильтр.
        </p>
      ) : (
        <div className="space-y-2">
          {filteredQuotes.map((q) => (
            <div
              key={q.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium text-text">
                  №{q.displayId} · {q.productName}
                </div>
                <div className="text-xs text-text-secondary">
                  {q.client.name}
                  {q.client.company ? ` · ${q.client.company}` : ""} · менеджер {q.manager.name} · {fmtRub(q.totalRub)} ₽
                </div>
                <div className="mt-0.5 text-xs text-text-secondary">
                  Удалил {q.deletedByManager?.name ?? "—"} {fmtDate(q.deletedAt)} · осталось {daysLeft(q.purgeAt)} дн.
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRestore(q.id)}
                disabled={restoringId === q.id}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
              >
                {restoringId === q.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Восстановить
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { ManagerTrashTab };
