"use client";

import { useEffect, useState } from "react";
import { Download, Landmark, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/desk/empty-state";
import { cn } from "@/lib/utils";

type IssuedInvoiceType = "buyout" | "services";
type IssuedInvoiceCurrency = "rub" | "usd" | "usdt" | "cny";
type CashCurrency = "rub" | "usd" | "cny";
type CashOrderDirection = "income" | "expense";

interface InvoiceRow {
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
  manager: { id: string; name: string };
  alsoCoversQuotes: { id: string; displayId: number }[];
}

interface CashMovementRow {
  id: string;
  date: string;
  type: CashOrderDirection;
  currencyForQuote: CashCurrency;
  amountForQuote: string;
  category: { name: string };
  account: { name: string };
  createdByManager: { name: string };
  comment: string;
  isBulkSplit: boolean;
  otherQuotesCount: number;
  rubEquivalent: number;
}

interface FinancesData {
  invoicesVisible: boolean;
  invoices: InvoiceRow[];
  cashVisible: boolean;
  cashMovements: CashMovementRow[];
  summary: { incomeRub: number; expenseRub: number; netRub: number };
}

const INVOICE_TYPE_LABEL: Record<IssuedInvoiceType, string> = { buyout: "Счёт на выкуп", services: "Счёт на услуги" };
const CURRENCY_LABEL: Record<IssuedInvoiceCurrency, string> = { rub: "₽", usd: "$", usdt: "USDT", cny: "¥" };

function fmt(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("ru-RU") : "—";
}

function fmtInvoiceAmount(value: string, currency: IssuedInvoiceCurrency): string {
  const n = Number(value);
  const rounded = currency === "usd" || currency === "usdt" || currency === "cny" ? n.toFixed(2) : Math.round(n).toString();
  return `${Number(rounded).toLocaleString("ru-RU")} ${CURRENCY_LABEL[currency]}`;
}

function fmtCashAmount(value: string, currency: CashCurrency): string {
  const n = Number(value);
  const rounded = currency === "rub" ? Math.round(n).toString() : n.toFixed(2);
  return `${Number(rounded).toLocaleString("ru-RU")} ${CURRENCY_LABEL[currency]}`;
}

function fmtDate(value: string): string {
  return new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function quotesWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "просчёт";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "просчёта";
  return "просчётов";
}

async function handleDownloadInvoice(inv: InvoiceRow) {
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

// Вся финансовая история одного просчёта: выставленные счета (с переходом
// к скачиванию) и реальные приходы/расходы по Кассе. Только чтение —
// ничего здесь не пересчитывает и не создаёт прибыль/премии заново, это
// делает app/api/manager-quotes/[id]/finances/route.ts, читая уже
// существующие IssuedInvoice/CashOrder/QuotePaymentAllocation. См. план
// mellow-forging-kay.md, PB-V5 chat 2026-08-23.
function QuoteFinancesTab({ quoteId }: { quoteId: string }) {
  const [data, setData] = useState<FinancesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/manager-quotes/${quoteId}/finances`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось связаться с сервером.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [quoteId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return <p className="text-sm text-error">{error ?? "Не удалось загрузить данные."}</p>;
  }

  const isEmpty = data.invoices.length === 0 && data.cashMovements.length === 0;

  return (
    <div className="space-y-4">
      {(data.invoicesVisible || data.cashVisible) && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="text-xs text-text-secondary">Приход</div>
            <div className="mt-1 text-lg font-bold text-success">{fmt(data.summary.incomeRub)} ₽</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="text-xs text-text-secondary">Расход</div>
            <div className="mt-1 text-lg font-bold text-error">{fmt(data.summary.expenseRub)} ₽</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="text-xs text-text-secondary">Итого</div>
            <div className={cn("mt-1 text-lg font-bold", data.summary.netRub >= 0 ? "text-text" : "text-error")}>
              {fmt(data.summary.netRub)} ₽
            </div>
          </div>
        </div>
      )}

      {isEmpty && (data.invoicesVisible || data.cashVisible) && (
        <EmptyState icon={Landmark} message="По этому просчёту пока не было ни счетов, ни движений денег." compact />
      )}

      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-text-secondary">Выставленные счета</div>
        {!data.invoicesVisible ? (
          <p className="text-xs text-text-secondary">Нет доступа к разделу «Выставленные счета».</p>
        ) : data.invoices.length === 0 ? null : (
          <div className="space-y-2">
            {data.invoices.map((inv) => (
              <div
                key={inv.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-2.5 text-sm",
                  inv.cancelled && "opacity-60",
                )}
              >
                <div className="min-w-0">
                  <div className="font-medium text-text">
                    №{inv.displayId} · {INVOICE_TYPE_LABEL[inv.type]} · {fmtInvoiceAmount(inv.amountTotal, inv.currency)}
                    {inv.cancelled && <span className="ml-2 text-xs font-semibold text-error">ОТМЕНЁН</span>}
                  </div>
                  <div className="text-xs text-text-secondary">
                    {fmtDate(inv.createdAt)} · менеджер {inv.manager.name}
                    {inv.note ? ` · ${inv.note}` : ""}
                  </div>
                  {inv.alsoCoversQuotes.length > 0 && (
                    <div className="text-xs text-text-secondary">
                      Также покрывает просчёты №{inv.alsoCoversQuotes.map((q) => q.displayId).join(", №")}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDownloadInvoice(inv)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
                >
                  <Download className="h-3.5 w-3.5" />
                  Скачать
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-text-secondary">Приход и расход по Кассе</div>
        {!data.cashVisible ? (
          <p className="text-xs text-text-secondary">Нет доступа к разделу «Отчёты по дням».</p>
        ) : data.cashMovements.length === 0 ? null : (
          <div className="space-y-2">
            {data.cashMovements.map((row) => (
              <div key={row.id} className="rounded-lg border border-border bg-surface p-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                        row.type === "income" ? "bg-success/10 text-success" : "bg-error/10 text-error",
                      )}
                    >
                      {row.type === "income" ? "Приход" : "Расход"}
                    </span>
                    <span className="truncate font-medium text-text">{row.category.name}</span>
                  </div>
                  <span className="shrink-0 font-medium text-text">{fmtCashAmount(row.amountForQuote, row.currencyForQuote)}</span>
                </div>
                <div className="mt-0.5 text-xs text-text-secondary">
                  {fmtDate(row.date)} · счёт {row.account.name} · провёл {row.createdByManager.name}
                  {row.comment ? ` · ${row.comment}` : ""}
                </div>
                {row.isBulkSplit && (
                  <div className="mt-0.5 text-xs text-text-secondary">
                    Часть общего платежа — ещё {row.otherQuotesCount} {quotesWord(row.otherQuotesCount)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export { QuoteFinancesTab };
