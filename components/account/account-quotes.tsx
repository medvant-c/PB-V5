"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileStack,
  FileText,
  ImageOff,
  Loader2,
  MessageSquare,
  PackageSearch,
} from "lucide-react";
import { QUOTE_STATUS_BADGE_CLASSES, QUOTE_STATUS_LABEL, type QuoteStatus } from "@/lib/quote-statuses";
import { CLIENT_STATUS_EXPLANATION } from "@/lib/client-status-copy";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface AccountQuoteService {
  name: string;
  priceRub: number;
}

interface AccountQuote {
  id: string;
  displayId: number;
  status: QuoteStatus;
  quoteType: string;
  productName: string;
  productDescription: string | null;
  color: string | null;
  dimensions: string | null;
  quantity: number;
  priceCnyPerUnit: number;
  totalPriceCny: number;
  priceRubPerUnit: number;
  totalPriceRub: number;
  chinaDeliveryRub: number;
  totalWeightKg: number;
  totalVolumeM3: number;
  densityKgM3: number;
  cargoDeliveryUsd: number;
  cargoDeliveryRub: number;
  searchServiceFeeRub: number;
  searchFeeWaived: boolean;
  buyoutCommissionPercent: number;
  buyoutCommissionRub: number;
  totalRub: number;
  cnyRateUsed: number;
  usdRateUsed: number;
  clientComment: string;
  managerComment: string;
  createdAt: string;
  photoIds: string[];
  attachedServices: AccountQuoteService[];
}

const QUOTE_TYPE_LABEL: Record<string, string> = {
  standard: "Standart",
  expert: "Expert",
  pro: "Pro",
};

function fmt(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU");
}

async function downloadBlob(res: Response, fallbackName: string) {
  const disposition = res.headers.get("content-disposition") ?? "";
  const fileNameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/);
  const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : fallbackName;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function AccountQuotes({ quotes }: { quotes: AccountQuote[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(quotes[0]?.id ?? null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<"pdf" | "excel" | "all" | string | null>(null);

  const [clientComments, setClientComments] = useState<Record<string, string>>(() =>
    Object.fromEntries(quotes.map((q) => [q.id, q.clientComment])),
  );
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);

  function getCommentDraft(quote: AccountQuote): string {
    return commentDrafts[quote.id] ?? clientComments[quote.id] ?? quote.clientComment;
  }

  async function handleSaveComment(quoteId: string) {
    const value = getCommentDraft(quotes.find((q) => q.id === quoteId)!);
    setSavingCommentId(quoteId);
    try {
      const res = await fetch(`/api/account-quotes/${quoteId}/comment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: value }),
      });
      if (!res.ok) {
        toast.error("Не удалось сохранить комментарий.");
        return;
      }
      const data = await res.json();
      setClientComments((current) => ({ ...current, [quoteId]: data.clientComment }));
      setCommentDrafts((current) => {
        const next = { ...current };
        delete next[quoteId];
        return next;
      });
      toast.success("Комментарий сохранён.");
    } catch {
      toast.error("Не удалось связаться с сервером.");
    } finally {
      setSavingCommentId(null);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  function toggleSelectAll() {
    setSelectedIds((current) => (current.length === quotes.length ? [] : quotes.map((q) => q.id)));
  }

  async function handleDownloadOne(quoteId: string) {
    setBusy(quoteId);
    try {
      const res = await fetch(`/api/account-quotes/${quoteId}/pdf`);
      if (!res.ok) {
        toast.error("Не удалось скачать PDF.");
        return;
      }
      await downloadBlob(res, "Расчёт.pdf");
    } catch {
      toast.error("Не удалось связаться с сервером.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDownloadAll() {
    setBusy("all");
    try {
      const res = await fetch("/api/account-quotes/quotes-pdf");
      if (!res.ok) {
        toast.error("Не удалось скачать список просчётов.");
        return;
      }
      await downloadBlob(res, "Все просчёты.pdf");
    } catch {
      toast.error("Не удалось связаться с сервером.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDownloadSelected(kind: "pdf" | "excel") {
    if (selectedIds.length === 0) return;
    setBusy(kind);
    try {
      const url = kind === "pdf" ? "/api/account-quotes/quotes-pdf-bundle" : "/api/account-quotes/quotes-excel";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteIds: selectedIds }),
      });
      if (!res.ok) {
        toast.error(kind === "pdf" ? "Не удалось скачать PDF." : "Не удалось скачать Excel.");
        return;
      }
      await downloadBlob(res, kind === "pdf" ? "Просчёты.pdf" : "Просчёты.xlsx");
    } catch {
      toast.error("Не удалось связаться с сервером.");
    } finally {
      setBusy(null);
    }
  }

  if (quotes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
        <PackageSearch className="h-8 w-8 text-text-secondary" />
        <p className="text-sm text-text-secondary">
          Просчётов пока нет — они появятся здесь, как только менеджер их подготовит.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div className="space-y-3">
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
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={busy !== null}
            className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileStack className="h-3.5 w-3.5" />}
            Скачать список всех ({quotes.length})
          </button>
        )}

        <button
          type="button"
          onClick={() => handleDownloadSelected("pdf")}
          disabled={selectedIds.length === 0 || busy !== null}
          className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          Скачать PDF {selectedIds.length > 0 && `(${selectedIds.length})`}
        </button>

        <button
          type="button"
          onClick={() => handleDownloadSelected("excel")}
          disabled={selectedIds.length === 0 || busy !== null}
          className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "excel" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
          Скачать Excel {selectedIds.length > 0 && `(${selectedIds.length})`}
        </button>
      </div>

      <div className="space-y-3">
        {quotes.map((quote) => {
          const isOpen = expandedId === quote.id;
          const perUnitRub = quote.quantity > 0 ? quote.totalRub / quote.quantity : 0;
          const heroPhotoId = quote.photoIds[0] ?? null;

          return (
            <div key={quote.id} className="rounded-2xl border border-border bg-surface shadow-sm">
              <div className="flex items-start gap-3 p-4">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(quote.id)}
                  onChange={() => toggleSelected(quote.id)}
                  aria-label={`Выбрать просчёт «${quote.productName}»`}
                  className="mt-1.5 shrink-0"
                />

                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : quote.id)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  {heroPhotoId ? (
                    <div className="group relative shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element -- client-facing portal, no next/image domain config needed for a same-origin API route */}
                      <img
                        src={`/api/account-quotes/photos/${heroPhotoId}`}
                        alt={quote.productName}
                        className="h-14 w-14 rounded-lg border border-border object-contain bg-bg"
                      />
                      <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden group-hover:block">
                        {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
                        <img
                          src={`/api/account-quotes/photos/${heroPhotoId}`}
                          alt={quote.productName}
                          className="h-auto w-auto max-h-[260px] max-w-[260px] rounded-lg border border-border bg-bg shadow-lg"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-bg text-text-secondary">
                      <ImageOff className="h-5 w-5" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-text">{quote.productName}</div>
                    <div className="mt-0.5 text-xs text-text-secondary">
                      №{quote.displayId} · {quote.quantity} шт · {formatDate(quote.createdAt)}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className={cn(
                            "cursor-help rounded-full px-3 py-1 text-xs font-medium underline decoration-dotted underline-offset-2",
                            QUOTE_STATUS_BADGE_CLASSES[quote.status],
                          )}
                        >
                          {QUOTE_STATUS_LABEL[quote.status]}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-64">
                        {CLIENT_STATUS_EXPLANATION[quote.status]}
                      </TooltipContent>
                    </Tooltip>
                    <span className="text-sm font-bold text-text">{fmt(quote.totalRub)} ₽</span>
                  </div>

                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-secondary transition-transform", isOpen && "rotate-180")} />
                </button>
              </div>

              {isOpen && (
                <div className="space-y-4 border-t border-border p-4">
                  {quote.photoIds.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                      {quote.photoIds.map((photoId) => (
                        <div key={photoId} className="group relative">
                          {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
                          <img
                            src={`/api/account-quotes/photos/${photoId}`}
                            alt={quote.productName}
                            className="h-16 w-16 rounded-lg border border-border bg-bg object-contain"
                          />
                          <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden group-hover:block">
                            {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
                            <img
                              src={`/api/account-quotes/photos/${photoId}`}
                              alt={quote.productName}
                              className="h-auto w-auto max-h-[260px] max-w-[260px] rounded-lg border border-border bg-bg shadow-lg"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-secondary">
                    <span>
                      Цвет: <span className="font-medium text-text">{quote.color ?? "—"}</span>
                    </span>
                    <span>
                      Габариты: <span className="font-medium text-text">{quote.dimensions ?? "—"}</span>
                    </span>
                    <span>
                      Вес: <span className="font-medium text-text">{quote.totalWeightKg.toFixed(1)} кг</span>
                    </span>
                    <span>
                      Объём: <span className="font-medium text-text">{quote.totalVolumeM3.toFixed(3)} м³</span>
                    </span>
                  </div>

                  {quote.productDescription && <p className="text-xs leading-relaxed text-text-secondary">{quote.productDescription}</p>}

                  <div className="overflow-hidden rounded-xl border border-border">
                    <div className="flex items-center justify-between border-b border-border bg-bg px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                      <span>Расчёт стоимости</span>
                    </div>
                    <div className="divide-y divide-border">
                      <div className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-text-secondary">
                          Товар ({quote.priceCnyPerUnit}¥ × {quote.quantity})
                        </span>
                        <span className="font-semibold text-text">
                          {fmt(quote.totalPriceCny)}¥ / {fmt(quote.totalPriceRub)}₽
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-text-secondary">Доставка по Китаю</span>
                        <span className="font-semibold text-text">{fmt(quote.chinaDeliveryRub)}₽</span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-text-secondary">Услуга поиска товара ({QUOTE_TYPE_LABEL[quote.quoteType] ?? quote.quoteType})</span>
                        {quote.searchFeeWaived ? (
                          <span className="font-semibold text-success">БЕСПЛАТНО</span>
                        ) : (
                          <span className="font-semibold text-text">{fmt(quote.searchServiceFeeRub)}₽</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-text-secondary">Организация выкупа ({quote.buyoutCommissionPercent}%)</span>
                        <span className="font-semibold text-text">{fmt(quote.buyoutCommissionRub)}₽</span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-text-secondary">
                          Доставка карго ({quote.totalWeightKg.toFixed(1)} кг, {quote.totalVolumeM3.toFixed(3)} м³, плотность{" "}
                          {fmt(quote.densityKgM3)} кг/м³)
                        </span>
                        <span className="font-semibold text-text">
                          {quote.cargoDeliveryUsd.toFixed(1)}$ / {fmt(quote.cargoDeliveryRub)}₽
                        </span>
                      </div>
                      {quote.attachedServices.map((service, index) => (
                        <div key={index} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span className="text-text-secondary">{service.name}</span>
                          <span className="font-semibold text-text">{fmt(service.priceRub)}₽</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-primary px-4 py-3">
                    <span className="text-sm font-semibold text-white">ИТОГО К ОПЛАТЕ</span>
                    <span className="text-lg font-bold text-white">{fmt(quote.totalRub)} ₽</span>
                  </div>
                  <p className="-mt-2 text-right text-xs text-text-secondary">
                    Цена за единицу под ключ: {fmt(perUnitRub)} ₽/шт
                  </p>

                  <p className="rounded-lg bg-bg px-3 py-2 text-[11px] text-text-secondary">
                    Расчёт произведён по курсу: 1¥ = {quote.cnyRateUsed.toFixed(2)}₽, 1$ = {quote.usdRateUsed.toFixed(2)}₽. При
                    оплате курс может отличаться — итоговая сумма пересчитывается по актуальному курсу на день оплаты.
                  </p>

                  <div className="space-y-2 rounded-xl border border-border p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                      <MessageSquare className="h-3.5 w-3.5" />
                      Комментарии
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-medium text-text-secondary">Комментарий менеджера</p>
                      <p className="rounded-lg bg-bg px-3 py-2 text-sm text-text">
                        {quote.managerComment || <span className="text-text-secondary">Пока нет комментария.</span>}
                      </p>
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-medium text-text-secondary">Ваш комментарий</p>
                      <textarea
                        value={getCommentDraft(quote)}
                        onChange={(e) => setCommentDrafts((current) => ({ ...current, [quote.id]: e.target.value }))}
                        placeholder="Напишите менеджеру — например, пожелание по цвету или срокам"
                        rows={2}
                        className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveComment(quote.id)}
                        disabled={savingCommentId === quote.id || getCommentDraft(quote) === (clientComments[quote.id] ?? quote.clientComment)}
                        className="mt-1.5 flex w-fit items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingCommentId === quote.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Сохранить комментарий
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDownloadOne(quote.id)}
                    disabled={busy !== null}
                    className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === quote.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Скачать этот просчёт PDF
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </TooltipProvider>
  );
}

export { AccountQuotes };
export type { AccountQuote };
