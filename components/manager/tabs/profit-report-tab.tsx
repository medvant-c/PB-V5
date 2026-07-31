"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, FileBarChart, Loader2, Lock } from "lucide-react";
import { EmptyState } from "@/components/desk/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QUOTE_STATUSES, QUOTE_STATUS_LABEL, QUOTE_STATUS_DOT_COLOR, type QuoteStatus } from "@/lib/quote-statuses";
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

interface ReportRow {
  id: string;
  displayId: number;
  productName: string;
  status: QuoteStatus;
  createdAt: string;
  confirmed: boolean;
  totalRub: number;
  proscetRub: number;
  buyoutRub: number;
  discountRub: number;
  fxProfitRub: number;
  cargoProfitRub: number;
  rawTotalRub: number;
  vladShareRub: number;
  yuraShareRub: number;
  managerPremiumRub: number;
  manager: { id: string; name: string };
  client: { id: string; name: string; company: string | null };
}

interface ReportTotals {
  totalRevenueRub: number;
  totalProfitRub: number;
  totalProscetRub: number;
  totalBuyoutRub: number;
  totalDiscountRub: number;
  totalFxProfitRub: number;
  totalCargoProfitRub: number;
  profitPoolRub: number;
  vladShareRub: number;
  yuraShareRub: number;
  managerPremiumRub: number;
  founderShareRub: number;
}

function fmt(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("ru-RU") : "—";
}

// Every money figure here shows ¥ first, ₽ alongside — same convention as
// manager-dashboard.tsx ("¥ is what the business actually thinks in").
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-bold text-text">Отчёт о прибыли</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Отметьте галочками нужные просчёты и сформируйте подробный отчёт — сколько заработает компания на этих
          сделках и сколько из этого достанется вам после доли Влада и премий менеджеров. Видно только руководителю.
        </p>
      </div>

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
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все клиенты</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
                {c.company ? ` (${c.company})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                    <span className={cn("text-xs font-medium", q.buyoutFactConfirmed ? "text-success" : "text-warning")}>
                      {q.buyoutFactConfirmed ? "Факт" : "Оценка"}
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
                  <th className="px-3 py-1.5 text-right font-medium">Просчёт</th>
                  <th className="px-3 py-1.5 text-right font-medium">Выкуп</th>
                  <th className="px-3 py-1.5 text-right font-medium">Скидка</th>
                  <th className="px-3 py-1.5 text-right font-medium">Курс. разница</th>
                  <th className="px-3 py-1.5 text-right font-medium">Карго</th>
                  <th className="px-3 py-1.5 text-right font-medium">Профит</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5 text-text-secondary">
                      {row.displayId}
                      <div className={cn("text-[10px] font-medium", row.confirmed ? "text-success" : "text-warning")}>
                        {row.confirmed ? "факт" : "оценка"}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-text">
                      <div className="max-w-52 truncate">{row.productName}</div>
                      <div className="text-xs text-text-secondary">
                        {row.client.name}
                        {row.client.company ? ` · ${row.client.company}` : ""} · {row.manager.name}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right text-text-secondary">{fmt(row.proscetRub)} ₽</td>
                    <td className="px-3 py-1.5 text-right text-text-secondary">{fmt(row.buyoutRub)} ₽</td>
                    <td className="px-3 py-1.5 text-right text-text-secondary">{fmt(row.discountRub)} ₽</td>
                    <td className="px-3 py-1.5 text-right text-text-secondary">{fmt(row.fxProfitRub)} ₽</td>
                    <td className="px-3 py-1.5 text-right text-text-secondary">{fmt(row.cargoProfitRub)} ₽</td>
                    <td className={cn("px-3 py-1.5 text-right font-bold", row.rawTotalRub >= 0 ? "text-success" : "text-error")}>
                      {fmt(row.rawTotalRub)} ₽
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

            <div className="mt-3 rounded-xl border border-dashed border-border p-3.5">
              <div className="text-xs font-semibold text-text-secondary">Из чего складывается прибыль компании</div>
              <div className="mt-2 space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Просчёт (услуга поиска + производство под заказ)</span>
                  <span className="font-medium text-text">{fmtBoth(report.totals.totalProscetRub, cnyRateRub)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Выкуп (комиссия + разница план/факт)</span>
                  <span className="font-medium text-text">{fmtBoth(report.totals.totalBuyoutRub, cnyRateRub)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Скидка поставщика</span>
                  <span className="font-medium text-text">{fmtBoth(report.totals.totalDiscountRub, cnyRateRub)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Курсовая разница</span>
                  <span className="font-medium text-text">{fmtBoth(report.totals.totalFxProfitRub, cnyRateRub)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Карго-маржа</span>
                  <span className="font-medium text-text">{fmtBoth(report.totals.totalCargoProfitRub, cnyRateRub)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-1.5 font-bold text-text">
                  <span>Итого</span>
                  <span>{fmtBoth(report.totals.totalProfitRub, cnyRateRub)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-bg p-4 sm:p-5">
            <div className="flex items-center gap-1.5 text-sm font-bold text-text">
              <Lock className="h-4 w-4 text-text-secondary" /> Доля партнёров — видно только руководителю
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
              10% от прибыли по каждой сделке (со всех источников, включая курсовую разницу) — Владу. Юре — фикс
              $/кг с каждого доставленного карго, отдельно от остальной прибыли. Остаток после доли Влада, доли
              Юры и премий менеджеров делится 50/50 между Александром и Антоном.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border bg-surface p-3.5">
                <div className="text-xs text-text-secondary">Влад (Партнёр) — 10%</div>
                <div className="mt-1 text-lg font-bold text-text">{fmtBoth(report.totals.vladShareRub, cnyRateRub)}</div>
              </div>
              <div className="rounded-xl border border-border bg-surface p-3.5">
                <div className="text-xs text-text-secondary">Юра (Инвестор) — карго</div>
                <div className="mt-1 text-lg font-bold text-text">{fmtBoth(report.totals.yuraShareRub, cnyRateRub)}</div>
              </div>
              <div className="rounded-xl border border-border bg-surface p-3.5">
                <div className="text-xs text-text-secondary">Александр (Основатель/Инвестор)</div>
                <div className="mt-1 text-lg font-bold text-text">{fmtBoth(report.totals.founderShareRub, cnyRateRub)}</div>
              </div>
              <div className="rounded-xl border border-border bg-surface p-3.5">
                <div className="text-xs text-text-secondary">Антон</div>
                <div className="mt-1 text-lg font-bold text-text">{fmtBoth(report.totals.founderShareRub, cnyRateRub)}</div>
              </div>
            </div>
          </div>

          {report.rows.some((r) => !r.confirmed) && (
            <p className="flex items-start gap-1.5 text-xs text-text-secondary">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Часть выбранных сделок ещё не подтверждена фактом выкупа — для них прибыль показана оценочно (план, а
              не факт) и пересчитается автоматически, как только выкуп подтвердят.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export { ManagerProfitReportTab };
