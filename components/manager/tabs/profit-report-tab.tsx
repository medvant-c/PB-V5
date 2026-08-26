"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, FileBarChart, Loader2, Lock } from "lucide-react";
import { PeriodProfitReport } from "@/components/manager/period-profit-report";
import { EmptyState } from "@/components/desk/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/manager/searchable-select";
import { QUOTE_STATUSES, QUOTE_STATUS_LABEL, QUOTE_STATUS_DOT_COLOR, BUYOUT_REALIZED_STATUSES, type QuoteStatus } from "@/lib/quote-statuses";
import { cn } from "@/lib/utils";

interface QuoteListRow {
  id: string;
  displayId: number;
  productName: string;
  status: QuoteStatus;
  totalRub: string;
  createdAt: string;
  buyoutFactConfirmed: boolean;
  manager: { id: string; name: string };
  client: { id: string; name: string; company: string | null };
}

interface ManagerOption {
  id: string;
  name: string;
}

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
}

// Выкуп ведём в ¥ (как реально закупают в Китае), Карго — в $ (как эта
// компания внутри ведёт карго, см. lib/desk-services/quote-real-financials.ts).
// Оба блока уже приходят с сервера в своей валюте, без пересчёта по курсу —
// пользователь явно попросил (2026-08-17) отвязать этот отчёт от
// сегодняшнего курса Тарифов, который "плыл" относительно реальных денег в
// Кассе.
interface BuyoutBlock {
  incomeCny: number;
  expenseCny: number;
  profitCny: number;
  realized: boolean;
}

interface CargoBlock {
  incomeUsd: number;
  expenseUsd: number;
  profitUsd: number;
  realized: boolean;
}

interface ReportRow {
  id: string;
  displayId: number;
  productName: string;
  status: QuoteStatus;
  createdAt: string;
  totalRub: number;
  totalProfitRub: number;
  buyout: BuyoutBlock;
  cargo: CargoBlock;
  managerPremiumRub: number;
  manager: { id: string; name: string };
  client: { id: string; name: string; company: string | null };
}

interface ReportTotals {
  totalRevenueRub: number;
  totalProfitRub: number;
  totalBuyoutIncomeCny: number;
  totalBuyoutExpenseCny: number;
  totalBuyoutProfitCny: number;
  totalCargoIncomeUsd: number;
  totalCargoExpenseUsd: number;
  totalCargoProfitUsd: number;
  totalBuyoutFxMarginRub: number;
  profitPoolRub: number;
  managerPremiumRub: number;
  investorShares: { id: string; name: string; shareType: string; shareRub: number }[];
}

function fmt(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("ru-RU") : "—";
}

function fmtCny(value: number): string {
  return `${fmt(value)} ¥`;
}

function fmtUsd(value: number): string {
  return Number.isFinite(value) ? `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $` : "— $";
}

// Every money figure here shows ¥ first, ₽ alongside — same convention as
// manager-dashboard.tsx ("¥ is what the business actually thinks in"). Всё
// ещё используется для сумм, которые по смыслу общие для Выкупа и Карго
// разом (оборот/прибыль компании/премии/доли) — там смешивать валюты блоков
// нельзя, только ₽.
function fmtBoth(rub: number, cnyRateRub: number): string {
  const cny = cnyRateRub > 0 ? rub / cnyRateRub : 0;
  return `${fmt(cny)} ¥ (${fmt(rub)} ₽)`;
}

function ManagerProfitReportTab() {
  const [quotes, setQuotes] = useState<QuoteListRow[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [cnyRateRub, setCnyRateRub] = useState(1);

  const [managerFilter, setManagerFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [report, setReport] = useState<{ rows: ReportRow[]; totals: ReportTotals } | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/manager-tariffs")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings?.cnyRateRub) setCnyRateRub(Number(data.settings.cnyRateRub));
      })
      .catch(() => {});
  }, []);

  const loadQuotes = useCallback(() => {
    setLoadingQuotes(true);
    const params = new URLSearchParams();
    if (managerFilter !== "all") params.set("managerId", managerFilter);
    if (clientFilter !== "all") params.set("clientId", clientFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return fetch(`/api/manager-profit-report?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setQuotes(data.quotes ?? []);
        setManagers(data.managers ?? []);
        setClients(data.clients ?? []);
      })
      .finally(() => setLoadingQuotes(false));
  }, [managerFilter, clientFilter, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadQuotes();
  }, [loadQuotes]);

  function toggleSelect(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  function toggleSelectAll() {
    setSelectedIds((current) => (current.length === quotes.length ? [] : quotes.map((q) => q.id)));
  }

  async function handleGenerateReport() {
    if (loadingReport || selectedIds.length === 0) return;
    setLoadingReport(true);
    setReportError(null);
    try {
      const res = await fetch("/api/manager-profit-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteIds: selectedIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReportError(data.error ?? "Не удалось сформировать отчёт.");
        return;
      }
      setReport(data);
    } catch {
      setReportError("Не удалось связаться с сервером.");
    } finally {
      setLoadingReport(false);
    }
  }

  async function handleDownloadPdf() {
    if (downloadingPdf || selectedIds.length === 0) return;
    setDownloadingPdf(true);
    setPdfError(null);
    try {
      const res = await fetch("/api/manager-profit-report/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteIds: selectedIds }),
      });
      if (!res.ok) {
        const data = await res.json();
        setPdfError(data.error ?? "Не удалось скачать PDF.");
        return;
      }
      const disposition = res.headers.get("content-disposition") ?? "";
      const fileNameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/);
      const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : "Отчёт о прибыли.pdf";

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setPdfError("Не удалось связаться с сервером.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  const [mode, setMode] = useState<"deals" | "period">("deals");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-bold text-text">Отчёт о прибыли</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {mode === "deals"
            ? "Отметьте галочками нужные просчёты и сформируйте подробный отчёт — сколько заработает компания на этих сделках и сколько из этого достанется вам после доли Влада и премий менеджеров."
            : "Сколько компания реально заработала за период и сколько кому причитается по итогам — не «заработаем, когда сделка реализуется», а по датам, когда деньги/факты реально произошли."}{" "}
          Видно только руководителю.
        </p>
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-bg p-1">
        <button
          type="button"
          onClick={() => setMode("deals")}
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
            mode === "deals" ? "bg-surface text-primary shadow-sm" : "text-text-secondary hover:text-text",
          )}
        >
          По выбранным сделкам
        </button>
        <button
          type="button"
          onClick={() => setMode("period")}
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
            mode === "period" ? "bg-surface text-primary shadow-sm" : "text-text-secondary hover:text-text",
          )}
        >
          Реальные деньги за период
        </button>
      </div>

      {mode === "period" && <PeriodProfitReport />}

      {mode === "deals" && (
      <>
      <div className="flex flex-wrap items-center gap-2">
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
        <SearchableSelect
          value={clientFilter}
          onValueChange={setClientFilter}
          allLabel="Все клиенты"
          className="w-48"
          searchPlaceholder="Поиск клиента…"
          options={clients.map((c) => ({
            value: c.id,
            label: c.company ? `${c.name} (${c.company})` : c.name,
          }))}
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as QuoteStatus | "all")}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {QUOTE_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: QUOTE_STATUS_DOT_COLOR[status] }} />
                {QUOTE_STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" placeholder="С даты" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" placeholder="По дату" />
        {quotes.length > 0 && (
          <label className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary">
            <input
              type="checkbox"
              checked={selectedIds.length > 0 && selectedIds.length === quotes.length}
              onChange={toggleSelectAll}
              aria-label="Выбрать все просчёты"
            />
            Выбрать все ({quotes.length})
          </label>
        )}
      </div>

      {loadingQuotes ? (
        <p className="text-sm text-text-secondary">Загрузка…</p>
      ) : quotes.length === 0 ? (
        <EmptyState icon={FileBarChart} message="Просчётов по этим фильтрам не найдено." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-200 border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-bg text-left text-xs text-text-secondary">
                <th className="px-3 py-1.5 font-medium" />
                <th className="px-3 py-1.5 font-medium">№</th>
                <th className="px-3 py-1.5 font-medium">Клиент</th>
                <th className="px-3 py-1.5 font-medium">Товар</th>
                <th className="px-3 py-1.5 font-medium">Менеджер</th>
                <th className="px-3 py-1.5 font-medium">Статус</th>
                <th className="px-3 py-1.5 font-medium">Факт/Оценка</th>
                <th className="px-3 py-1.5 text-right font-medium">Клиент платит</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id} className="border-b border-border last:border-0 hover:bg-bg">
                  <td className="px-3 py-1.5">
                    <input type="checkbox" checked={selectedIds.includes(q.id)} onChange={() => toggleSelect(q.id)} />
                  </td>
                  <td className="px-3 py-1.5 text-text-secondary">{q.displayId}</td>
                  <td className="px-3 py-1.5 text-text">
                    {q.client.name}
                    {q.client.company ? ` · ${q.client.company}` : ""}
                  </td>
                  <td className="max-w-60 truncate px-3 py-1.5 text-text">{q.productName}</td>
                  <td className="px-3 py-1.5 text-text-secondary">{q.manager.name}</td>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: QUOTE_STATUS_DOT_COLOR[q.status] }} />
                      {QUOTE_STATUS_LABEL[q.status]}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        q.buyoutFactConfirmed || BUYOUT_REALIZED_STATUSES.includes(q.status) ? "text-success" : "text-warning",
                      )}
                    >
                      {q.buyoutFactConfirmed || BUYOUT_REALIZED_STATUSES.includes(q.status) ? "Факт" : "План"}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium text-text">{fmt(Number(q.totalRub))} ₽</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-secondary">Выбрано: {selectedIds.length}</span>
        <Button type="button" size="sm" onClick={handleGenerateReport} disabled={loadingReport || selectedIds.length === 0}>
          {loadingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сформировать отчёт"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handleDownloadPdf} disabled={downloadingPdf || selectedIds.length === 0}>
          {downloadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Скачать PDF
        </Button>
      </div>
      {reportError && <p className="text-xs text-error">{reportError}</p>}
      {pdfError && <p className="text-xs text-error">{pdfError}</p>}

      {report && (
        <div className="space-y-4 border-t border-border pt-6">
          <h3 className="text-sm font-bold text-text">Разбивка по сделкам ({report.rows.length})</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-250 border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-bg text-left text-xs text-text-secondary">
                  <th className="px-3 py-1.5 font-medium">№</th>
                  <th className="px-3 py-1.5 font-medium">Клиент / товар</th>
                  <th className="px-3 py-1.5 text-right font-medium">Выкуп: поступило</th>
                  <th className="px-3 py-1.5 text-right font-medium">Выкуп: потратили</th>
                  <th className="px-3 py-1.5 text-right font-medium">Выкуп: прибыль</th>
                  <th className="px-3 py-1.5 text-right font-medium">Карго: поступило</th>
                  <th className="px-3 py-1.5 text-right font-medium">Карго: потратили</th>
                  <th className="px-3 py-1.5 text-right font-medium">Карго: прибыль</th>
                  <th className="px-3 py-1.5 text-right font-medium">Прибыль</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0 hover:bg-bg">
                    <td className="px-3 py-1.5 text-text-secondary">
                      {row.displayId}
                      <div className={cn("text-[10px] font-medium", row.buyout.realized ? "text-success" : "text-warning")}>
                        {row.buyout.realized ? "факт" : "план"}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-text">
                      <div className="max-w-52 truncate">{row.productName}</div>
                      <div className="text-xs text-text-secondary">
                        {row.client.name}
                        {row.client.company ? ` · ${row.client.company}` : ""} · {row.manager.name}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right text-text-secondary">{fmtCny(row.buyout.incomeCny)}</td>
                    <td className="px-3 py-1.5 text-right text-text-secondary">{fmtCny(row.buyout.expenseCny)}</td>
                    <td className="px-3 py-1.5 text-right text-text-secondary">{fmtCny(row.buyout.profitCny)}</td>
                    <td className="px-3 py-1.5 text-right text-text-secondary">{fmtUsd(row.cargo.incomeUsd)}</td>
                    <td className="px-3 py-1.5 text-right text-text-secondary">{fmtUsd(row.cargo.expenseUsd)}</td>
                    <td className="px-3 py-1.5 text-right text-text-secondary">{fmtUsd(row.cargo.profitUsd)}</td>
                    <td className={cn("px-3 py-1.5 text-right font-bold", row.totalProfitRub >= 0 ? "text-success" : "text-error")}>
                      {fmt(row.totalProfitRub)} ₽
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-border bg-bg p-4 sm:p-5">
            <h3 className="text-sm font-bold text-text">Итого по выбранным сделкам</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface p-3.5">
                <div className="text-xs text-text-secondary">Клиенты заплатят (оборот)</div>
                <div className="mt-1 text-lg font-bold text-text">{fmtBoth(report.totals.totalRevenueRub, cnyRateRub)}</div>
              </div>
              <div className="rounded-xl border border-border bg-surface p-3.5">
                <div className="text-xs text-text-secondary">Прибыль компании</div>
                <div className={cn("mt-1 text-lg font-bold", report.totals.totalProfitRub >= 0 ? "text-text" : "text-error")}>
                  {fmtBoth(report.totals.totalProfitRub, cnyRateRub)}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-surface p-3.5">
                <div className="text-xs text-text-secondary">Премии менеджеров</div>
                <div className="mt-1 text-lg font-bold text-text">{fmtBoth(report.totals.managerPremiumRub, cnyRateRub)}</div>
              </div>
              <div className="rounded-xl border border-border bg-surface p-3.5">
                <div className="text-xs text-text-secondary">Доступно для распределения</div>
                <div className="mt-1 text-lg font-bold text-primary">
                  {fmtBoth(report.totals.profitPoolRub - report.totals.managerPremiumRub, cnyRateRub)}
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-dashed border-border p-3.5">
                <div className="text-xs font-semibold text-text-secondary">Выкуп</div>
                <div className="mt-2 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Поступило</span>
                    <span className="font-medium text-text">{fmtCny(report.totals.totalBuyoutIncomeCny)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Потратили</span>
                    <span className="font-medium text-text">{fmtCny(report.totals.totalBuyoutExpenseCny)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-1.5 font-bold text-text">
                    <span>Прибыль</span>
                    <span>{fmtCny(report.totals.totalBuyoutProfitCny)}</span>
                  </div>
                  {/* Справочно, в ₽ (курсовая разница — величина в рублях по
                      природе) — не влияет ни на прибыль выше, ни на премии,
                      просто показывает, сколько из неё дал именно курс.
                      См. PB-V5 chat 2026-08-26. */}
                  <div className="flex items-center justify-between text-xs text-text-secondary">
                    <span>из них маржа с курса (справочно)</span>
                    <span>{fmt(report.totals.totalBuyoutFxMarginRub)} ₽</span>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-dashed border-border p-3.5">
                <div className="text-xs font-semibold text-text-secondary">Карго</div>
                <div className="mt-2 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Поступило</span>
                    <span className="font-medium text-text">{fmtUsd(report.totals.totalCargoIncomeUsd)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Потратили</span>
                    <span className="font-medium text-text">{fmtUsd(report.totals.totalCargoExpenseUsd)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-1.5 font-bold text-text">
                    <span>Прибыль</span>
                    <span>{fmtUsd(report.totals.totalCargoProfitUsd)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {report.totals.investorShares.length > 0 && (
            <div className="rounded-2xl border border-border bg-bg p-4 sm:p-5">
              <div className="flex items-center gap-1.5 text-sm font-bold text-text">
                <Lock className="h-4 w-4 text-text-secondary" /> Руководящий состав — видно только руководителю
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
                Доля каждого инвестора считается по его собственному правилу (% от прибыли по каждой подтверждённой
                сделке, фикс $/кг с доставленного карго, или остаток поровну после всех остальных долей и премий
                менеджеров) — состав и ставки настраиваются в «Настройки» → «Руководящий состав».
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                {report.totals.investorShares.map((inv) => (
                  <div key={inv.id} className="rounded-xl border border-border bg-surface p-3.5">
                    <div className="text-xs text-text-secondary">{inv.name}</div>
                    <div className="mt-1 text-lg font-bold text-text">{fmtBoth(inv.shareRub, cnyRateRub)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.rows.some((r) => !r.buyout.realized) && (
            <p className="flex items-start gap-1.5 text-xs text-text-secondary">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Часть выбранных сделок ещё не дошла до статуса «в доставке на склад» — для них прибыль показана по
              плану из просчёта и пересчитается на реальные деньги из Кассы автоматически, как только статус
              изменится.
            </p>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}

export { ManagerProfitReportTab };
