"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Preset = "day" | "week" | "month" | "custom";

interface PayoutRow {
  owedRub: number;
  paidRub: number;
  remainingRub: number;
}

interface ManagerPayout extends PayoutRow {
  managerId: string;
  managerName: string;
}

interface InvestorPayout extends PayoutRow {
  investorId: string;
  investorName: string;
  shareType: string;
}

interface PeriodReport {
  period: { from: string; to: string };
  companyProfitRub: number;
  totalManagerPremiumRub: number;
  investorPoolRub: number;
  managerPayouts: ManagerPayout[];
  investorPayouts: InvestorPayout[];
  cnyRateRub: number | null;
}

function fmt(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("ru-RU") : "—";
}

function fmtBoth(rub: number, cnyRateRub: number | null): string {
  if (!cnyRateRub || cnyRateRub <= 0) return `${fmt(rub)} ₽`;
  return `${fmt(rub / cnyRateRub)} ¥ (${fmt(rub)} ₽)`;
}

function todayLocalMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function computeRange(preset: Preset, customFrom: string, customTo: string): { from: Date; to: Date } | null {
  const now = new Date();
  if (preset === "day") {
    return { from: todayLocalMidnight(), to: now };
  }
  if (preset === "week") {
    const from = todayLocalMidnight();
    from.setDate(from.getDate() - 6);
    return { from, to: now };
  }
  if (preset === "month") {
    const from = todayLocalMidnight();
    from.setDate(1);
    return { from, to: now };
  }
  if (!customFrom || !customTo) return null;
  const from = new Date(`${customFrom}T00:00:00`);
  const to = new Date(`${customTo}T23:59:59.999`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return { from, to };
}

const PRESET_LABEL: Record<Preset, string> = {
  day: "Сегодня",
  week: "Неделя",
  month: "Месяц",
  custom: "Свой период",
};

interface PayoutTableRow extends PayoutRow {
  id: string;
  name: string;
  sub?: string;
}

function PayoutTable({ title, rows, cnyRateRub }: { title: string; rows: PayoutTableRow[]; cnyRateRub: number | null }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-secondary">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-xs text-text-secondary">Нет данных за этот период.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg text-left text-xs text-text-secondary">
                <th className="px-3 py-2 font-medium">Получатель</th>
                <th className="px-3 py-2 font-medium">Причитается</th>
                <th className="px-3 py-2 font-medium">Уже выплачено</th>
                <th className="px-3 py-2 font-medium">Остаток к доплате</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-text">
                    {row.name}
                    {row.sub && <span className="ml-1 text-xs text-text-secondary">{row.sub}</span>}
                  </td>
                  <td className="px-3 py-2 text-text">{fmtBoth(row.owedRub, cnyRateRub)}</td>
                  <td className="px-3 py-2 text-text-secondary">{fmtBoth(row.paidRub, cnyRateRub)}</td>
                  <td
                    className={cn(
                      "px-3 py-2 font-semibold",
                      row.remainingRub > 0 ? "text-warning" : row.remainingRub < 0 ? "text-error" : "text-success",
                    )}
                  >
                    {fmtBoth(row.remainingRub, cnyRateRub)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const SHARE_TYPE_LABEL: Record<string, string> = {
  percent_of_profit: "% от прибыли",
  flat_per_cargo_kg: "фикс. за кг карго",
  remainder_share: "остаток поровну",
};

function PeriodProfitReport() {
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [report, setReport] = useState<PeriodReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => computeRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  async function handleGenerate() {
    if (!range || loading) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });
      const res = await fetch(`/api/manager-period-report?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось построить отчёт.");
        return;
      }
      setReport(data);
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["day", "week", "month", "custom"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPreset(p)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              preset === p ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-text-secondary hover:border-primary/30",
            )}
          >
            {PRESET_LABEL[p]}
          </button>
        ))}
        {preset === "custom" && (
          <>
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-40" />
            <span className="text-text-secondary">—</span>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-40" />
          </>
        )}
        <Button type="button" size="sm" onClick={handleGenerate} disabled={!range || loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Показать"}
        </Button>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      {report && (
        <div className="space-y-5 border-t border-border pt-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-bg p-4">
              <p className="text-xs font-medium text-text-secondary">Реальная прибыль компании за период</p>
              <p className="mt-1 text-xl font-bold text-text">{fmtBoth(report.companyProfitRub, report.cnyRateRub)}</p>
            </div>
            <div className="rounded-xl border border-border bg-bg p-4">
              <p className="text-xs font-medium text-text-secondary">Премии менеджерам за период</p>
              <p className="mt-1 text-xl font-bold text-text">{fmtBoth(report.totalManagerPremiumRub, report.cnyRateRub)}</p>
            </div>
          </div>

          <PayoutTable
            title="Менеджеры"
            cnyRateRub={report.cnyRateRub}
            rows={report.managerPayouts.map((m) => ({
              id: m.managerId,
              name: m.managerName,
              owedRub: m.owedRub,
              paidRub: m.paidRub,
              remainingRub: m.remainingRub,
            }))}
          />

          <PayoutTable
            title="Инвесторы"
            cnyRateRub={report.cnyRateRub}
            rows={report.investorPayouts.map((i) => ({
              id: i.investorId,
              name: i.investorName,
              sub: SHARE_TYPE_LABEL[i.shareType] ?? i.shareType,
              owedRub: i.owedRub,
              paidRub: i.paidRub,
              remainingRub: i.remainingRub,
            }))}
          />

          <p className="text-xs text-text-secondary">
            «Причитается» и «прибыль компании» считаются по датам, когда реально пришли деньги или подтвердился факт
            выкупа/выдача карго — не по дате создания просчёта. «Уже выплачено» — сумма расходных ордеров за этот же
            период по статьям, привязанным к получателю (см. «Управлять статьями» в Кассе).
          </p>
        </div>
      )}
    </div>
  );
}

export { PeriodProfitReport };
