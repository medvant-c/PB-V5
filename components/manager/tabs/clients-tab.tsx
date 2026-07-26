"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Copy,
  Download,
  FileSpreadsheet,
  FileStack,
  ImageOff,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/desk/empty-state";
import { QuoteDialog } from "@/components/manager/quote-dialog";
import { ClientFilesPanel } from "@/components/manager/client-files-panel";
import {
  QUOTE_STATUSES,
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_BADGE_CLASSES,
  QUOTE_STATUS_DOT_COLOR,
  STALE_IN_PROGRESS_MS,
  type QuoteStatus,
} from "@/lib/quote-statuses";
import { cn } from "@/lib/utils";

const SOURCE_LABELS: Record<string, string> = {
  instagram: "Instagram",
  telegram: "Telegram",
  website: "Сайт",
  referral: "Рекомендация",
  other: "Другое",
};

interface ClientRecord {
  id: string;
  displayId: number;
  name: string;
  company: string | null;
  messenger: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  createdByManagerId: string | null;
  createdByManager: { name: string } | null;
  archivedAt: string | null;
  createdAt: string;
}

interface QuoteRecord {
  id: string;
  displayId: number;
  productName: string;
  quoteType: string;
  status: QuoteStatus;
  statusChangedAt: string;
  totalRub: string;
  totalPriceRub: string;
  chinaDeliveryRub: string;
  searchServiceFeeRub: string;
  searchFeeWaived: boolean;
  buyoutCommissionRub: string;
  cargoDeliveryRub: string;
  cargoDiscountUsd: string;
  deliveryPricingMode: string;
  densityKgM3: string;
  createdAt: string;
  manager: { name: string };
  firstPhotoId: string | null;
}

// Below this density, cargo is always priced "по объёму" regardless of the
// manager's chosen mode — see LOW_DENSITY_VOLUME_THRESHOLD_KG_M3 in
// lib/quote-engine.ts. Kept in sync manually since this is a display-only
// label, not a pricing decision.
const LOW_DENSITY_VOLUME_THRESHOLD_KG_M3 = 100;

function fmtRub(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

// Everything that makes up totalRub, for the hover breakdown — attached
// services aren't a field on Quote itself (they live in a separate table),
// so that line is the residual after every other known component is
// subtracted, not a separately-fetched value.
function quoteBreakdown(quote: QuoteRecord) {
  const totalPriceRub = Number(quote.totalPriceRub);
  const chinaDeliveryRub = Number(quote.chinaDeliveryRub);
  const searchServiceFeeRub = Number(quote.searchServiceFeeRub);
  const buyoutCommissionRub = Number(quote.buyoutCommissionRub);
  const cargoDeliveryRub = Number(quote.cargoDeliveryRub);
  const totalRub = Number(quote.totalRub);
  const cargoBasis =
    quote.deliveryPricingMode === "density" && Number(quote.densityKgM3) >= LOW_DENSITY_VOLUME_THRESHOLD_KG_M3
      ? "по плотности"
      : "по объёму";
  const knownSum = totalPriceRub + chinaDeliveryRub + searchServiceFeeRub + buyoutCommissionRub + cargoDeliveryRub;
  const attachedServicesRub = Math.max(0, totalRub - knownSum);

  return {
    totalPriceRub,
    chinaDeliveryRub,
    searchServiceFeeRub,
    buyoutCommissionRub,
    cargoDeliveryRub,
    cargoBasis,
    cargoDiscountUsd: Number(quote.cargoDiscountUsd),
    attachedServicesRub,
  };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function isStale(quote: QuoteRecord): boolean {
  if (quote.status !== "in_progress") return false;
  return Date.now() - new Date(quote.statusChangedAt).getTime() > STALE_IN_PROGRESS_MS;
}

function ClientQuotes({
  clientId,
  refreshKey,
  onEdit,
  onChanged,
}: {
  clientId: string;
  refreshKey: number;
  onEdit: (quoteId: string) => void;
  onChanged: () => void;
}) {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [recalculatingId, setRecalculatingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<"recalculate" | "duplicate" | "status" | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return fetch(`/api/manager-quotes?clientId=${clientId}`)
      .then((res) => res.json())
      .then((data) => setQuotes(data.quotes ?? []))
      .finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function handleStatusChange(quoteId: string, status: string) {
    setChangingStatusId(quoteId);
    try {
      const res = await fetch(`/api/manager-quotes/${quoteId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) await load();
    } finally {
      setChangingStatusId(null);
    }
  }

  async function handleDelete(quoteId: string) {
    setDeletingId(quoteId);
    try {
      const res = await fetch(`/api/manager-quotes/${quoteId}`, { method: "DELETE" });
      if (res.ok) {
        await load();
        onChanged();
      }
    } finally {
      setDeletingId(null);
    }
  }

  function toggleSelected(quoteId: string) {
    setSelectedIds((current) =>
      current.includes(quoteId) ? current.filter((id) => id !== quoteId) : [...current, quoteId],
    );
  }

  function toggleSelectAll() {
    setSelectedIds((current) => (current.length === quotes.length ? [] : quotes.map((q) => q.id)));
  }

  async function handleRecalculate(quoteId: string) {
    setRecalculatingId(quoteId);
    try {
      const res = await fetch(`/api/manager-quotes/${quoteId}/recalculate`, { method: "POST" });
      if (res.ok) await load();
    } finally {
      setRecalculatingId(null);
    }
  }

  async function handleBulkRecalculate() {
    if (selectedIds.length === 0 || bulkBusy) return;
    setBulkBusy("recalculate");
    setBulkError(null);
    try {
      const results = await Promise.all(
        selectedIds.map((id) => fetch(`/api/manager-quotes/${id}/recalculate`, { method: "POST" })),
      );
      if (results.some((r) => !r.ok)) setBulkError("Часть просчётов не удалось пересчитать.");
      await load();
    } catch {
      setBulkError("Не удалось связаться с сервером.");
    } finally {
      setBulkBusy(null);
    }
  }

  async function handleBulkDuplicate() {
    if (selectedIds.length === 0 || bulkBusy) return;
    setBulkBusy("duplicate");
    setBulkError(null);
    try {
      const results = await Promise.all(
        selectedIds.map((id) => fetch(`/api/manager-quotes/${id}/duplicate`, { method: "POST" })),
      );
      if (results.some((r) => !r.ok)) setBulkError("Часть просчётов не удалось дублировать.");
      setSelectedIds([]);
      await load();
      onChanged();
    } catch {
      setBulkError("Не удалось связаться с сервером.");
    } finally {
      setBulkBusy(null);
    }
  }

  async function handleBulkStatusChange(status: string) {
    if (selectedIds.length === 0 || bulkBusy) return;
    setBulkBusy("status");
    setBulkError(null);
    try {
      const results = await Promise.all(
        selectedIds.map((id) =>
          fetch(`/api/manager-quotes/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          }),
        ),
      );
      if (results.some((r) => !r.ok)) setBulkError("Часть статусов не удалось изменить.");
      await load();
    } catch {
      setBulkError("Не удалось связаться с сервером.");
    } finally {
      setBulkBusy(null);
    }
  }

  async function handleExportExcel() {
    if (exportingExcel || selectedIds.length === 0) return;
    setExportingExcel(true);
    setExportError(null);
    try {
      const res = await fetch(`/api/manager-clients/${clientId}/quotes-excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteIds: selectedIds }),
      });
      if (!res.ok) {
        const data = await res.json();
        setExportError(data.error ?? "Не удалось выгрузить в Excel.");
        return;
      }
      const disposition = res.headers.get("content-disposition") ?? "";
      const fileNameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/);
      const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : "Просчёты.xlsx";

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Не удалось связаться с сервером.");
    } finally {
      setExportingExcel(false);
    }
  }

  if (loading) return <p className="text-xs text-text-secondary">Загрузка просчётов…</p>;
  if (quotes.length === 0) return <p className="text-xs text-text-secondary">Просчётов пока нет.</p>;

  return (
    <TooltipProvider>
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary">
          <input
            type="checkbox"
            checked={selectedIds.length > 0 && selectedIds.length === quotes.length}
            onChange={toggleSelectAll}
            aria-label="Выбрать все просчёты"
          />
          Выбрать все
        </label>
        {quotes.length > 1 && (
          <a
            href={`/api/manager-clients/${clientId}/quotes-pdf`}
            className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
          >
            <FileStack className="h-3.5 w-3.5" /> Скачать все просчёты ({quotes.length})
          </a>
        )}
        <button
          type="button"
          onClick={handleExportExcel}
          disabled={selectedIds.length === 0 || exportingExcel}
          className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exportingExcel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
          Выгрузить в Excel {selectedIds.length > 0 && `(${selectedIds.length})`}
        </button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              disabled={selectedIds.length === 0 || bulkBusy !== null}
              className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkBusy === "recalculate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Пересчитать тарифы {selectedIds.length > 0 && `(${selectedIds.length})`}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Пересчитать тарифы?</AlertDialogTitle>
              <AlertDialogDescription>
                Выбранные просчёты ({selectedIds.length}) будут пересчитаны по сегодняшним курсам, комиссии,
                ставкам поиска и карго — вместо цифр, зафиксированных при создании. Итоговая сумма может измениться.
                Вы уверены, что хотите пересчитать тарифы?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkRecalculate}>Пересчитать</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <button
          type="button"
          onClick={handleBulkDuplicate}
          disabled={selectedIds.length === 0 || bulkBusy !== null}
          className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {bulkBusy === "duplicate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
          Дублировать {selectedIds.length > 0 && `(${selectedIds.length})`}
        </button>

        <Select value="" onValueChange={handleBulkStatusChange} disabled={selectedIds.length === 0 || bulkBusy !== null}>
          <SelectTrigger className="h-8 w-52 text-xs">
            <SelectValue placeholder={`Изменить статус выбранным${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`} />
          </SelectTrigger>
          <SelectContent>
            {QUOTE_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: QUOTE_STATUS_DOT_COLOR[status] }} />
                {QUOTE_STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {bulkError && <p className="text-xs text-error">{bulkError}</p>}
      {exportError && <p className="text-xs text-error">{exportError}</p>}
      <ul className="space-y-1.5">
        {quotes.map((quote) => (
          <li key={quote.id} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selectedIds.includes(quote.id)}
                onChange={() => toggleSelected(quote.id)}
                className="shrink-0"
                aria-label={`Выбрать просчёт №${quote.displayId}`}
              />
              <div className="group relative shrink-0">
                {quote.firstPhotoId ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- session-gated API route, not a static asset */}
                    <img
                      src={`/api/manager-quotes/photos/${quote.firstPhotoId}`}
                      alt=""
                      className="h-9 w-9 rounded-md border border-border object-cover"
                    />
                    {/* No fixed box + object-contain here — that forced every photo
                        into a square frame, letterboxing a non-square source into a
                        thin sliver. h-auto/w-auto with only a max-size cap keeps the
                        source's real aspect ratio ("1 к 1", undistorted) instead. */}
                    <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden group-hover:block">
                      {/* eslint-disable-next-line @next/next/no-img-element -- session-gated API route, not a static asset */}
                      <img
                        src={`/api/manager-quotes/photos/${quote.firstPhotoId}`}
                        alt=""
                        className="h-auto w-auto max-h-[140px] max-w-[140px] rounded-lg border border-border bg-bg shadow-lg"
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-border text-text-secondary">
                    <ImageOff className="h-4 w-4" />
                  </div>
                )}
              </div>
              <a
                href={`/api/manager-quotes/${quote.id}/pdf`}
                className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80"
              >
                <Download className="h-4 w-4 shrink-0 text-text-secondary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-text">
                    №{quote.displayId} · {quote.productName}
                  </span>
                  <span className="block truncate text-xs text-text-secondary">
                    {formatDate(quote.createdAt)} ·{" "}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help font-bold text-success underline decoration-success/40 decoration-dotted underline-offset-2">
                          {fmtRub(Number(quote.totalRub))} ₽
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="w-56">
                        {(() => {
                          const b = quoteBreakdown(quote);
                          return (
                            <div className="space-y-1">
                              <div className="flex justify-between gap-4">
                                <span>Товар</span>
                                <span>{fmtRub(b.totalPriceRub)} ₽</span>
                              </div>
                              {b.chinaDeliveryRub > 0 && (
                                <div className="flex justify-between gap-4">
                                  <span>Доставка по Китаю</span>
                                  <span>{fmtRub(b.chinaDeliveryRub)} ₽</span>
                                </div>
                              )}
                              <div className="flex justify-between gap-4">
                                <span>Услуга поиска</span>
                                <span>{quote.searchFeeWaived ? "бесплатно" : `${fmtRub(b.searchServiceFeeRub)} ₽`}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span>Комиссия за выкуп</span>
                                <span>{fmtRub(b.buyoutCommissionRub)} ₽</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span>Карго ({b.cargoBasis})</span>
                                <span>{fmtRub(b.cargoDeliveryRub)} ₽</span>
                              </div>
                              {b.cargoDiscountUsd > 0 && (
                                <div className="flex justify-between gap-4">
                                  <span>Скидка на карго</span>
                                  <span>-${b.cargoDiscountUsd.toFixed(1)}</span>
                                </div>
                              )}
                              {b.attachedServicesRub > 1 && (
                                <div className="flex justify-between gap-4">
                                  <span>Доп. услуги</span>
                                  <span>{fmtRub(b.attachedServicesRub)} ₽</span>
                                </div>
                              )}
                              <div className="flex justify-between gap-4 border-t border-surface/25 pt-1 font-bold">
                                <span>Итого</span>
                                <span>{fmtRub(Number(quote.totalRub))} ₽</span>
                              </div>
                            </div>
                          );
                        })()}
                      </TooltipContent>
                    </Tooltip>{" "}
                    · {quote.manager.name}
                  </span>
                </span>
              </a>

              <Select
                value={quote.status}
                onValueChange={(status) => handleStatusChange(quote.id, status)}
                disabled={changingStatusId === quote.id}
              >
                <SelectTrigger
                  className={cn(
                    "h-8 w-42.5 shrink-0 rounded-full border-0 text-xs font-medium",
                    QUOTE_STATUS_BADGE_CLASSES[quote.status],
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUOTE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: QUOTE_STATUS_DOT_COLOR[status] }}
                      />
                      {QUOTE_STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <button
                type="button"
                onClick={() => onEdit(quote.id)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-primary/10 hover:text-primary"
                aria-label="Редактировать просчёт"
              >
                <Pencil className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => handleRecalculate(quote.id)}
                disabled={recalculatingId === quote.id}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                aria-label="Пересчитать по новым тарифам"
                title="Пересчитать по новым тарифам"
              >
                {recalculatingId === quote.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-error/10 hover:text-error"
                    aria-label="Удалить просчёт"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Удалить просчёт?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Просчёт №{quote.displayId} «{quote.productName}» и приложенные к нему фото будут удалены без
                      возможности восстановления.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction variant="danger" onClick={() => handleDelete(quote.id)} disabled={deletingId === quote.id}>
                      Удалить
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {isStale(quote) && (
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-error/10 px-2.5 py-2 text-xs font-medium text-error">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Почему так долго идёт просчёт? Это влияет на твой доход. Поторопись!
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
    </TooltipProvider>
  );
}

function ManagerClientsTab() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [quoteDialogClientId, setQuoteDialogClientId] = useState<string | null>(null);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [quotesRefreshKey, setQuotesRefreshKey] = useState(0);

  // /api/managers is owner-only (403 for anyone else) — its success doubles
  // as "am I the owner" without threading the role down as a prop, and its
  // response is exactly the manager list the transfer dropdown needs.
  const [allManagers, setAllManagers] = useState<{ id: string; name: string }[] | null>(null);
  const [transferringClientId, setTransferringClientId] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/managers")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAllManagers(data?.managers ?? null));
  }, []);

  async function handleTransfer(clientId: string, managerId: string) {
    if (!managerId) return;
    setTransferringClientId(clientId);
    try {
      const res = await fetch(`/api/manager-clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transferToManagerId: managerId }),
      });
      if (res.ok) {
        await loadClients();
        setQuotesRefreshKey((key) => key + 1);
      }
    } finally {
      setTransferringClientId(null);
    }
  }

  const [showNewForm, setShowNewForm] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [messenger, setMessenger] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState<string>("other");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showArchived, setShowArchived] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", company: "", phone: "", messenger: "", email: "", source: "other" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/manager-clients${showArchived ? "?includeArchived=1" : ""}`);
      const data = await res.json();
      if (res.ok) setClients(data.clients);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  function startEditing(client: ClientRecord) {
    setEditingClientId(client.id);
    setEditError(null);
    setEditDraft({
      name: client.name,
      company: client.company ?? "",
      phone: client.phone ?? "",
      messenger: client.messenger ?? "",
      email: client.email ?? "",
      source: client.source ?? "other",
    });
  }

  async function handleSaveEdit(clientId: string) {
    if (editSaving) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/manager-clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "Не удалось сохранить клиента.");
        return;
      }
      setEditingClientId(null);
      await loadClients();
    } catch {
      setEditError("Не удалось связаться с сервером.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleToggleArchive(client: ClientRecord) {
    setArchivingId(client.id);
    try {
      const res = await fetch(`/api/manager-clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !client.archivedAt }),
      });
      if (res.ok) await loadClients();
    } finally {
      setArchivingId(null);
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/manager-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company, phone, messenger, email, source }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось создать клиента.");
        return;
      }
      setName("");
      setCompany("");
      setPhone("");
      setMessenger("");
      setEmail("");
      setSource("other");
      setShowNewForm(false);
      await loadClients();
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setCreating(false);
    }
  }

  const quoteDialogClient = clients.find((c) => c.id === quoteDialogClientId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-text">Клиенты</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-text-secondary">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Показывать архивные
          </label>
          {!showNewForm && (
            <Button type="button" size="sm" variant="outline" onClick={() => setShowNewForm(true)}>
              <Plus className="h-4 w-4" /> Новый клиент
            </Button>
          )}
        </div>
      </div>

      {showNewForm && (
        <form onSubmit={handleCreate} className="space-y-2 rounded-xl border border-dashed border-border p-3">
          <p className="text-xs font-semibold text-text-secondary">Новый клиент</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Имя клиента" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input placeholder="Компания" value={company} onChange={(e) => setCompany(e.target.value)} />
            <Input placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            <Input placeholder="Telegram / WeChat" value={messenger} onChange={(e) => setMessenger(e.target.value)} />
            <Input type="email" placeholder="Email (необязательно)" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Добавить"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewForm(false)}>
              Отмена
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-text-secondary">Загрузка…</p>
      ) : clients.length === 0 ? (
        <EmptyState icon={UserRound} message="Клиентов пока нет — добавьте первого кнопкой выше." />
      ) : (
        <div className="space-y-2">
          {clients.map((client) => {
            const isOpen = expandedClientId === client.id;
            const isEditing = editingClientId === client.id;
            return (
              <div
                key={client.id}
                className={cn("rounded-xl border border-border bg-surface", client.archivedAt && "opacity-60")}
              >
                <button
                  type="button"
                  onClick={() => setExpandedClientId(isOpen ? null : client.id)}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {client.name.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-text">
                        <span className="text-text-secondary">№{client.displayId}</span> {client.name}
                        {client.company && <span className="text-text-secondary"> · {client.company}</span>}
                        {client.archivedAt && <span className="ml-1.5 text-xs font-normal text-error">архив</span>}
                      </div>
                      <div className="text-xs text-text-secondary">
                        {client.email ?? "без email"}
                        {client.phone ? ` · ${client.phone}` : ""}
                        {client.source ? ` · ${SOURCE_LABELS[client.source] ?? client.source}` : ""}
                      </div>
                    </div>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-secondary transition-transform", isOpen && "rotate-180")} />
                </button>

                {isOpen && (
                  <div className="space-y-3 border-t border-border p-3">
                    {allManagers && (
                      <p className="text-xs text-text-secondary">
                        Сейчас у менеджера: <span className="font-medium text-text">{client.createdByManager?.name ?? "—"}</span>
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => startEditing(client)}>
                          <Pencil className="h-3.5 w-3.5" /> Редактировать
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleArchive(client)}
                          disabled={archivingId === client.id}
                        >
                          {archivingId === client.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : client.archivedAt ? (
                            "Из архива"
                          ) : (
                            "В архив"
                          )}
                        </Button>
                        {allManagers && (
                          <Select
                            value=""
                            onValueChange={(managerId) => handleTransfer(client.id, managerId)}
                            disabled={transferringClientId === client.id}
                          >
                            <SelectTrigger className="h-8 w-44 text-xs">
                              <SelectValue placeholder="Передать менеджеру" />
                            </SelectTrigger>
                            <SelectContent>
                              {allManagers
                                .filter((m) => m.id !== client.createdByManagerId)
                                .map((m) => (
                                  <SelectItem key={m.id} value={m.id}>
                                    {m.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <Button type="button" size="sm" onClick={() => setQuoteDialogClientId(client.id)}>
                        Сформировать просчёт
                      </Button>
                    </div>

                    {isEditing && (
                      <div className="space-y-2 rounded-lg bg-bg p-3">
                        <p className="text-xs font-semibold text-text-secondary">Редактирование клиента</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input
                            placeholder="Имя клиента"
                            value={editDraft.name}
                            onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                          />
                          <Input
                            placeholder="Компания"
                            value={editDraft.company}
                            onChange={(e) => setEditDraft((d) => ({ ...d, company: e.target.value }))}
                          />
                          <Input
                            placeholder="Телефон"
                            value={editDraft.phone}
                            onChange={(e) => setEditDraft((d) => ({ ...d, phone: e.target.value }))}
                          />
                          <Input
                            placeholder="Telegram / WeChat"
                            value={editDraft.messenger}
                            onChange={(e) => setEditDraft((d) => ({ ...d, messenger: e.target.value }))}
                          />
                          <Input
                            type="email"
                            placeholder="Email (необязательно)"
                            value={editDraft.email}
                            onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
                          />
                          <Select value={editDraft.source} onValueChange={(v) => setEditDraft((d) => ({ ...d, source: v }))}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                                <SelectItem key={key} value={key}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {editError && <p className="text-xs text-error">{editError}</p>}
                        <div className="flex gap-2">
                          <Button type="button" size="sm" onClick={() => handleSaveEdit(client.id)} disabled={editSaving}>
                            {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setEditingClientId(null)}>
                            Отмена
                          </Button>
                        </div>
                      </div>
                    )}

                    <Label>Документы клиента</Label>
                    <ClientFilesPanel clientId={client.id} />

                    <Label>Просчёты клиента</Label>
                    <ClientQuotes
                      clientId={client.id}
                      refreshKey={quotesRefreshKey}
                      onEdit={(quoteId) => {
                        setQuoteDialogClientId(client.id);
                        setEditingQuoteId(quoteId);
                      }}
                      onChanged={() => setQuotesRefreshKey((key) => key + 1)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {quoteDialogClient && (
        <QuoteDialog
          client={quoteDialogClient}
          open
          editingQuoteId={editingQuoteId}
          onOpenChange={(open) => {
            if (!open) {
              setQuoteDialogClientId(null);
              setEditingQuoteId(null);
            }
          }}
          onSaved={() => setQuotesRefreshKey((key) => key + 1)}
        />
      )}
    </div>
  );
}

export { ManagerClientsTab };
