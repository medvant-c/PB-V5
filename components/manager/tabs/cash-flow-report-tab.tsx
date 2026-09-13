"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, FileText, Loader2, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/desk/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface InvoiceRow {
  id: string;
  displayId: number;
  type: string;
  currency: string;
  amountTotal: number;
  createdAt: string;
  cancelled: boolean;
}

interface OrderRow {
  id: string;
  date: string;
  type: string;
  amountCny: number;
  comment: string;
  quoteDisplayId: number;
  productName: string;
  categoryName: string;
}

interface ClientFlowRow {
  clientId: string;
  clientName: string;
  invoices: InvoiceRow[];
  orders: OrderRow[];
  incomeCny: number;
  expenseCny: number;
  netCny: number;
  // Резерв под выкуп по этому клиенту — сколько из incomeCny ещё реально
  // не потрачено на закупку (см. lib/desk-services/quote-reserve.ts). Не
  // зависит от выбранного месяца — состояние "на сейчас".
  reservedCny: number;
}

interface ReserveRow {
  quoteId: string;
  quoteDisplayId: number;
  productName: string;
  clientId: string;
  clientName: string;
  clientDisplayId: number;
  paidCny: number;
  expenseCny: number;
  reservedCny: number;
}

const INVOICE_TYPE_LABEL: Record<string, string> = { buyout: "Выкуп", services: "Услуги" };
const CURRENCY_LABEL: Record<string, string> = { rub: "₽", usd: "$", usdt: "USDT", cny: "¥" };

function money(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const d = new Date(year, monthIndex - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  return `${d.toLocaleDateString("ru-RU")} ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

// «Отчёт о движении средств» — самообслуживание менеджера: по каждому
// своему клиенту видно, какие счета выставлялись и какие были реальные
// приходы/расходы по его просчётам за выбранный месяц. Для owner/senior —
// по всей зоне видимости (см. getVisibleManagerIds в
// app/api/manager-cash-flow-report/route.ts). См. план «Самообслуживание
// менеджера», PB-V5 chat 2026-09-11.
function ManagerCashFlowReportTab() {
  const [month, setMonth] = useState(todayIso());
  const [clients, setClients] = useState<ClientFlowRow[]>([]);
  const [reservedCny, setReservedCny] = useState(0);
  const [reserveRows, setReserveRows] = useState<ReserveRow[]>([]);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [realBuyoutIncomeCny, setRealBuyoutIncomeCny] = useState(0);
  const [realBuyoutExpenseCny, setRealBuyoutExpenseCny] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);

  const loadReport = useCallback(() => {
    setLoading(true);
    return fetch(`/api/manager-cash-flow-report?month=${month}`)
      .then((res) => res.json())
      .then((data) => {
        setClients(data.clients ?? []);
        setReservedCny(data.reservedCny ?? 0);
        setReserveRows(data.reserveRows ?? []);
        setRealBuyoutIncomeCny(data.realBuyoutIncomeCny ?? 0);
        setRealBuyoutExpenseCny(data.realBuyoutExpenseCny ?? 0);
      })
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const totalIncomeCny = clients.reduce((sum, c) => sum + c.incomeCny, 0);
  const totalExpenseCny = clients.reduce((sum, c) => sum + c.expenseCny, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-text">Отчёт о движении средств</h2>
          <p className="mt-1 text-sm text-text-secondary">По каждому клиенту — выставленные счета, приходы и расходы за месяц.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
          <Button type="button" size="sm" variant="ghost" onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-text-secondary">Приход за месяц</p>
          <p className="mt-1 text-lg font-bold text-success">¥ {money(totalIncomeCny)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-text-secondary">Расход за месяц</p>
          <p className="mt-1 text-lg font-bold text-error">¥ {money(totalExpenseCny)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-text-secondary">Доход с выкупа за месяц</p>
          <p className="mt-1 text-lg font-bold text-primary">¥ {money(realBuyoutIncomeCny - realBuyoutExpenseCny)}</p>
          <p className="mt-1 text-[11px] text-text-secondary">
            это база расчёта премии — та же цифра, что и на Главной («Выкуп: поступило/потратили»)
          </p>
        </div>
      </div>

      {reservedCny > 0 && (
        <button
          type="button"
          onClick={() => setReserveOpen(true)}
          className="w-full rounded-xl border border-dashed border-border bg-surface p-3 text-left text-xs text-text-secondary underline decoration-dotted hover:text-text"
        >
          ¥ {money(reservedCny)} из общего прихода по вашим клиентам ещё не потрачено на закупку (клиент оплатил, но
          товар ещё не куплен, или указан остаток к доплате поставщику) — уже учтено в «Доходе с выкупа» выше, это
          не прибыль. Резерв — состояние на сейчас по всем открытым просчётам, не зависит от выбранного месяца, в
          отличие от прихода/расхода за месяц рядом. Нажмите, чтобы увидеть по каким просчётам.
        </button>
      )}

      <Dialog open={reserveOpen} onOpenChange={setReserveOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Резерв под выкуп по вашим просчётам</DialogTitle>
            <DialogDescription>
              Деньги клиентов, уже полученные за товар по открытым просчётам, но ещё реально не потраченные на
              закупку.
            </DialogDescription>
          </DialogHeader>
          {reserveRows.length === 0 ? (
            <p className="text-sm text-text-secondary">Нет просчётов с неизрасходованным резервом.</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-2xl border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg text-left text-xs text-text-secondary">
                    <th className="px-3 py-1.5 font-medium">Клиент</th>
                    <th className="px-3 py-1.5 font-medium">Просчёт</th>
                    <th className="px-3 py-1.5 font-medium">Оплачено, ¥</th>
                    <th className="px-3 py-1.5 font-medium">Потрачено, ¥</th>
                    <th className="px-3 py-1.5 font-medium">Резерв, ¥</th>
                  </tr>
                </thead>
                <tbody>
                  {reserveRows.map((row) => (
                    <tr key={row.quoteId} className="border-b border-border last:border-0">
                      <td className="px-3 py-1.5 whitespace-nowrap text-text-secondary">
                        №{row.clientDisplayId} {row.clientName}
                      </td>
                      <td className="max-w-60 truncate px-3 py-1.5 text-text-secondary" title={row.productName}>
                        №{row.quoteDisplayId} — {row.productName}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-text-secondary">¥ {money(row.paidCny)}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-text-secondary">¥ {money(row.expenseCny)}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap font-medium text-text">¥ {money(row.reservedCny)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {loading ? (
        <p className="flex items-center gap-1.5 text-xs text-text-secondary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Загрузка…
        </p>
      ) : clients.length === 0 ? (
        <EmptyState icon={TrendingUp} message="За этот месяц движений по вашим клиентам пока нет." />
      ) : (
        <ul className="space-y-2">
          {clients.map((c) => {
            const expanded = expandedClientId === c.clientId;
            return (
              <li key={c.clientId} className="rounded-xl border border-border bg-surface">
                <button
                  type="button"
                  onClick={() => setExpandedClientId(expanded ? null : c.clientId)}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-secondary transition-transform", expanded && "rotate-180")} />
                    <span className="truncate text-sm font-medium text-text">{c.clientName}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-xs">
                    <span className="text-success">+¥ {money(c.incomeCny)}</span>
                    <span className="text-error">−¥ {money(c.expenseCny)}</span>
                    <span className="font-bold text-primary">= ¥ {money(c.netCny)}</span>
                    {c.reservedCny > 0 && (
                      <span className="text-warning" title="Резерв под выкуп — оплачено, но ещё не потрачено на закупку">
                        резерв ¥ {money(c.reservedCny)}
                      </span>
                    )}
                  </div>
                </button>

                {expanded && (
                  <div className="space-y-3 border-t border-border p-3">
                    {c.invoices.length > 0 && (
                      <div>
                        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                          <FileText className="h-3.5 w-3.5" /> Выставленные счета
                        </p>
                        <ul className="space-y-1">
                          {c.invoices.map((inv) => (
                            <li key={inv.id} className="flex items-center justify-between rounded-lg bg-bg px-2.5 py-1.5 text-xs">
                              <span className={cn("text-text-secondary", inv.cancelled && "line-through")}>
                                Счёт №{inv.displayId} — {INVOICE_TYPE_LABEL[inv.type] ?? inv.type} · {formatDateTime(inv.createdAt)}
                                {inv.cancelled && " (отменён)"}
                              </span>
                              <span className="font-medium text-text">
                                {money(inv.amountTotal)} {CURRENCY_LABEL[inv.currency] ?? inv.currency}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {c.orders.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-text-secondary">Приходы и расходы</p>
                        <ul className="space-y-1">
                          {c.orders.map((o) => (
                            <li key={o.id} className="flex items-center justify-between gap-2 rounded-lg bg-bg px-2.5 py-1.5 text-xs">
                              <span className="min-w-0 truncate text-text-secondary">
                                {formatDateTime(o.date)} · {o.categoryName} · Просчёт №{o.quoteDisplayId} — {o.productName}
                                {o.comment && ` · ${o.comment}`}
                              </span>
                              <span className={cn("shrink-0 font-medium", o.type === "income" ? "text-success" : "text-error")}>
                                {o.type === "income" ? "+" : "−"}¥ {money(o.amountCny)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export { ManagerCashFlowReportTab };
