"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Percent, Pencil } from "lucide-react";
import { EmptyState } from "@/components/desk/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/manager/searchable-select";
import { QuoteDialog } from "@/components/manager/quote-dialog";

type QuoteDiscountType =
  | "cargo_discount"
  | "cargo_rate"
  | "buyout_commission"
  | "search_fee"
  | "custom_production"
  | "cny_rate"
  | "usd_rate";

interface DiscountRow {
  quoteId: string;
  quoteDisplayId: number;
  productName: string;
  createdAt: string;
  client: { id: string; name: string; company: string | null };
  manager: { id: string; name: string };
  type: QuoteDiscountType;
  label: string;
  valueLabel: string;
}

const TYPE_OPTIONS: { value: QuoteDiscountType; label: string }[] = [
  { value: "cargo_discount", label: "Скидка на карго" },
  { value: "cargo_rate", label: "Индивидуальная ставка карго" },
  { value: "buyout_commission", label: "Индивидуальная комиссия выкупа" },
  { value: "search_fee", label: "Услуга поиска — скидка/своя цена" },
  { value: "custom_production", label: "Производство под заказ — своя цена" },
  { value: "cny_rate", label: "Индивидуальный курс ¥→₽" },
  { value: "usd_rate", label: "Индивидуальный курс $→₽" },
];

function fmtDate(value: string): string {
  return new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function ManagerClientDiscountsTab() {
  const [rows, setRows] = useState<DiscountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<QuoteDiscountType | "all">("all");
  const [managerFilter, setManagerFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  // "Отменить или изменить" — не отдельный редактор с собственным пересчётом
  // цены (второй, потенциально расходящийся с движком расчёта путь для
  // финансово чувствительных полей — риск не оправдан), а тот же QuoteDialog,
  // что и везде в кабинете: открыть просчёт, обнулить или поменять поле,
  // сохранить — движок сам пересчитает totalRub. См. PB-V5 chat 2026-08-10.
  const [editingQuote, setEditingQuote] = useState<{ id: string; client: { id: string; name: string } } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch("/api/manager-quote-discounts")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setRows(data.discounts ?? []);
      })
      .catch(() => setError("Не удалось связаться с сервером."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const managers = useMemo(() => {
    const byId = new Map<string, string>();
    for (const r of rows) byId.set(r.manager.id, r.manager.name);
    return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [rows]);

  const clients = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; company: string | null }>();
    for (const r of rows) byId.set(r.client.id, r.client);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (typeFilter !== "all" && r.type !== typeFilter) return false;
    if (managerFilter !== "all" && r.manager.id !== managerFilter) return false;
    if (clientFilter !== "all" && r.client.id !== clientFilter) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      String(r.quoteDisplayId).includes(query) ||
      r.productName.toLowerCase().includes(query) ||
      r.client.name.toLowerCase().includes(query) ||
      (r.client.company ?? "").toLowerCase().includes(query)
    );
  });

  const isFiltered = Boolean(searchQuery) || typeFilter !== "all" || managerFilter !== "all" || clientFilter !== "all";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-text">Скидки по клиентам</h2>
        <p className="mt-1 text-xs text-text-secondary">
          Все индивидуальные скидки и ручные ставки по просчётам: карго, комиссия выкупа, услуга поиска, производство
          под заказ, курс ¥/$. Одна строка — одна применённая скидка; на одном просчёте их может быть несколько.
        </p>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по клиенту, товару или № просчёта…"
          className="w-full sm:w-72"
        />
        <SearchableSelect
          value={clientFilter}
          onValueChange={setClientFilter}
          allLabel="Все клиенты"
          className="w-48"
          searchPlaceholder="Поиск клиента…"
          options={clients.map((c) => ({ value: c.id, label: c.company ? `${c.name} (${c.company})` : c.name }))}
        />
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as QuoteDiscountType | "all")}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы скидок</SelectItem>
            {TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {managers.length > 1 && (
          <Select value={managerFilter} onValueChange={setManagerFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все менеджеры</SelectItem>
              {managers.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {isFiltered && (
          <span className="text-xs text-text-secondary">
            Найдено: {filtered.length} из {rows.length}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-text-secondary">Загрузка…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Percent} message="Скидок и индивидуальных ставок пока не применяли." />
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-text-secondary">
          Ничего не найдено — попробуйте изменить запрос или сбросить фильтры.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-180 border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-bg text-left text-xs text-text-secondary">
                <th className="px-3 py-1.5 font-medium">№</th>
                <th className="px-3 py-1.5 font-medium">Клиент</th>
                <th className="px-3 py-1.5 font-medium">Менеджер</th>
                <th className="px-3 py-1.5 font-medium">Тип</th>
                <th className="px-3 py-1.5 text-right font-medium">Значение</th>
                <th className="px-3 py-1.5 font-medium">Дата</th>
                <th className="px-3 py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={`${r.quoteId}-${r.type}-${i}`} className="border-b border-border last:border-0 hover:bg-bg">
                  <td className="px-3 py-1.5 text-text-secondary">{r.quoteDisplayId}</td>
                  <td className="px-3 py-1.5 text-text">
                    {r.client.name}
                    {r.client.company ? ` · ${r.client.company}` : ""}
                  </td>
                  <td className="px-3 py-1.5 text-text-secondary">{r.manager.name}</td>
                  <td className="px-3 py-1.5 text-text-secondary">{r.label}</td>
                  <td className="px-3 py-1.5 text-right font-medium text-text">{r.valueLabel}</td>
                  <td className="px-3 py-1.5 text-text-secondary">{fmtDate(r.createdAt)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => setEditingQuote({ id: r.quoteId, client: { id: r.client.id, name: r.client.name } })}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Отменить/изменить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingQuote && (
        <QuoteDialog
          client={editingQuote.client}
          editingQuoteId={editingQuote.id}
          open={editingQuote !== null}
          onOpenChange={(open) => !open && setEditingQuote(null)}
          onSaved={() => {
            setEditingQuote(null);
            load();
          }}
        />
      )}
    </div>
  );
}

export { ManagerClientDiscountsTab };
