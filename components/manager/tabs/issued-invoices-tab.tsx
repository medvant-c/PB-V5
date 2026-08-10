"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Pencil, Receipt } from "lucide-react";
import { EmptyState } from "@/components/desk/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/manager/searchable-select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type IssuedInvoiceType = "buyout" | "services";
type IssuedInvoiceCurrency = "rub" | "usd" | "usdt" | "cny";

interface InvoiceRecord {
  id: string;
  displayId: number;
  type: IssuedInvoiceType;
  currency: IssuedInvoiceCurrency;
  amountTotal: string;
  fileName: string;
  note: string;
  cancelled: boolean;
  cancelledAt: string | null;
  createdAt: string;
  client: { id: string; name: string; company: string | null };
  manager: { id: string; name: string };
  quotes: { id: string; displayId: number }[];
}

const TYPE_LABEL: Record<IssuedInvoiceType, string> = { buyout: "Счёт на выкуп", services: "Счёт на услуги" };
const CURRENCY_LABEL: Record<IssuedInvoiceCurrency, string> = { rub: "₽", usd: "$", usdt: "USDT", cny: "¥" };

function fmtAmount(value: string, currency: IssuedInvoiceCurrency): string {
  const n = Number(value);
  const rounded = currency === "usd" || currency === "usdt" || currency === "cny" ? n.toFixed(2) : Math.round(n).toString();
  return `${Number(rounded).toLocaleString("ru-RU")} ${CURRENCY_LABEL[currency]}`;
}

function fmtDate(value: string): string {
  return new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function ManagerIssuedInvoicesTab() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<IssuedInvoiceType | "all">("all");
  const [currencyFilter, setCurrencyFilter] = useState<IssuedInvoiceCurrency | "all">("all");
  const [managerFilter, setManagerFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  // Отменённые счета по умолчанию скрыты — тот же принцип, что и «Показывать
  // архивные» у клиентов: история никуда не девается, просто не мозолит
  // глаза в повседневном списке.
  const [showCancelled, setShowCancelled] = useState(false);

  const [editing, setEditing] = useState<InvoiceRecord | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editCancelled, setEditCancelled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch("/api/manager-issued-invoices")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setInvoices(data.invoices ?? []);
      })
      .catch(() => setError("Не удалось связаться с сервером."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const managers = useMemo(() => {
    const byId = new Map<string, string>();
    for (const inv of invoices) byId.set(inv.manager.id, inv.manager.name);
    return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [invoices]);

  const clients = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; company: string | null }>();
    for (const inv of invoices) byId.set(inv.client.id, inv.client);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [invoices]);

  const filtered = invoices.filter((inv) => {
    if (!showCancelled && inv.cancelled) return false;
    if (typeFilter !== "all" && inv.type !== typeFilter) return false;
    if (currencyFilter !== "all" && inv.currency !== currencyFilter) return false;
    if (managerFilter !== "all" && inv.manager.id !== managerFilter) return false;
    if (clientFilter !== "all" && inv.client.id !== clientFilter) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      String(inv.displayId).includes(query) ||
      inv.client.name.toLowerCase().includes(query) ||
      (inv.client.company ?? "").toLowerCase().includes(query) ||
      inv.note.toLowerCase().includes(query) ||
      inv.quotes.some((q) => String(q.displayId).includes(query))
    );
  });

  const isFiltered =
    Boolean(searchQuery) || typeFilter !== "all" || currencyFilter !== "all" || managerFilter !== "all" || clientFilter !== "all" || showCancelled;

  async function handleDownload(inv: InvoiceRecord) {
    const res = await fetch(`/api/manager-issued-invoices/${inv.id}/download`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = inv.fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  function openEdit(inv: InvoiceRecord) {
    setEditing(inv);
    setEditNote(inv.note);
    setEditCancelled(inv.cancelled);
    setSaveError(null);
  }

  async function handleSave() {
    if (!editing || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/manager-issued-invoices/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: editNote, cancelled: editCancelled }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Не удалось сохранить.");
        return;
      }
      setEditing(null);
      await load();
    } catch {
      setSaveError("Не удалось связаться с сервером.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-text">Выставленные счета</h2>
        <p className="mt-1 text-xs text-text-secondary">
          Журнал всех выставленных счетов на выкуп и на услуги — с возможностью пересмотреть, переcкачать или отменить.
          Оплата отдельно отслеживается в «Кассе» и статусах просчётов — здесь только сам факт, что счёт был выставлен.
        </p>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по клиенту, № счёта или № просчёта…"
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
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as IssuedInvoiceType | "all")}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            <SelectItem value="buyout">Счёт на выкуп</SelectItem>
            <SelectItem value="services">Счёт на услуги</SelectItem>
          </SelectContent>
        </Select>
        <Select value={currencyFilter} onValueChange={(v) => setCurrencyFilter(v as IssuedInvoiceCurrency | "all")}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все валюты</SelectItem>
            <SelectItem value="rub">₽</SelectItem>
            <SelectItem value="usd">$</SelectItem>
            <SelectItem value="usdt">USDT</SelectItem>
            <SelectItem value="cny">¥</SelectItem>
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
        <label className="flex items-center gap-1.5 text-xs text-text-secondary">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
          Показывать отменённые
        </label>
        {isFiltered && (
          <span className="text-xs text-text-secondary">
            Найдено: {filtered.length} из {invoices.length}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-text-secondary">Загрузка…</p>
      ) : invoices.length === 0 ? (
        <EmptyState icon={Receipt} message="Счетов пока не выставляли." />
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-text-secondary">
          Ничего не найдено — попробуйте изменить запрос или сбросить фильтры.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((inv) => (
            <div
              key={inv.id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm",
                inv.cancelled && "opacity-60",
              )}
            >
              <div className="min-w-0">
                <div className="font-medium text-text">
                  №{inv.displayId} · {TYPE_LABEL[inv.type]} · {fmtAmount(inv.amountTotal, inv.currency)}
                  {inv.cancelled && <span className="ml-2 text-xs font-semibold text-error">ОТМЕНЁН</span>}
                </div>
                <div className="text-xs text-text-secondary">
                  {inv.client.name}
                  {inv.client.company ? ` · ${inv.client.company}` : ""} · менеджер {inv.manager.name} ·{" "}
                  {inv.quotes.length > 0 ? `просчёты №${inv.quotes.map((q) => q.displayId).join(", №")}` : "без просчётов"}
                </div>
                <div className="mt-0.5 text-xs text-text-secondary">
                  {fmtDate(inv.createdAt)}
                  {inv.note ? ` · ${inv.note}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleDownload(inv)}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
                >
                  <Download className="h-3.5 w-3.5" />
                  Скачать
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(inv)}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Изменить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Счёт №{editing?.displayId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">Заметка</label>
              <Textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={3} placeholder="Например: клиент попросил перевыставить" />
            </div>
            <label className="flex items-center gap-1.5 text-sm text-text">
              <input type="checkbox" checked={editCancelled} onChange={(e) => setEditCancelled(e.target.checked)} />
              Счёт отменён
            </label>
            {saveError && <p className="text-xs text-error">{saveError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              Отмена
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { ManagerIssuedInvoicesTab };
