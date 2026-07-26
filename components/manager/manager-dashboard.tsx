"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Wallet, PackageCheck, Percent, Sparkles, Lock, Ship, Handshake } from "lucide-react";
import { Card } from "@/components/ui/card";
import { QUOTE_STATUSES, QUOTE_STATUS_LABEL, QUOTE_STATUS_BADGE_CLASSES } from "@/lib/quote-statuses";
import { cn } from "@/lib/utils";

interface StatSummary {
  statusCounts: Record<string, number>;
  totalQuotes: number;
  boughtRub: number;
  handedRub: number;
  pipelineRub: number;
  pipelineProfitRub: number;
  premiumRub: number;
  premiumRatePercent: number;
  conversionPercent: number;
}

// Mirrors CONVERSION_PREMIUM_THRESHOLD_PERCENT in app/api/manager-dashboard/
// route.ts — the premium tier itself is computed server-side, this just has
// to agree on where the color flips.
const CONVERSION_PREMIUM_THRESHOLD_PERCENT = 60;

// Small SVG donut — conversion is the one number that decides whether a
// manager's premium is 10% or 7%, so it gets a glanceable visual instead of
// just another number in a row of numbers.
function ConversionRing({ percent, size = 56 }: { percent: number; size?: number }) {
  const isHigh = percent >= CONVERSION_PREMIUM_THRESHOLD_PERCENT;
  const strokeWidth = size / 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(Math.max(percent, 0), 100) / 100) * circumference;
  const colorClass = isHigh ? "text-success" : "text-error";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          className={cn("transition-[stroke-dashoffset] duration-500", colorClass)}
        />
      </svg>
      <span
        className={cn("absolute inset-0 flex items-center justify-center font-bold", colorClass)}
        style={{ fontSize: Math.max(8, size / 4.2) }}
      >
        {percent}%
      </span>
    </div>
  );
}

interface PerManagerRow extends StatSummary {
  managerId: string;
  managerName: string;
}

interface DashboardData {
  overall: StatSummary;
  perManager: PerManagerRow[] | null;
  // Only set for the owner — company-wide pipeline profit minus every
  // manager's own premium. null for everyone else.
  expectedIncomeRub: number | null;
  // Owner-only split of the pipeline's profit into its two sources — cargo
  // margin vs everything else (search fee, buyout commission, services).
  // Both null for everyone else.
  cargoProfitRub: number | null;
  otherProfitRub: number | null;
}

function fmt(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

function StatSummaryRow({ stats }: { stats: StatSummary }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-bg p-3">
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Wallet className="h-3.5 w-3.5" /> Уже выкуплено
          </div>
          <div className="mt-1 text-lg font-bold text-text">{fmt(stats.boughtRub)} ₽</div>
        </div>
        <div className="rounded-xl bg-bg p-3">
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <PackageCheck className="h-3.5 w-3.5" /> Выдано клиенту
          </div>
          <div className="mt-1 text-lg font-bold text-text">{fmt(stats.handedRub)} ₽</div>
        </div>
        <div className="rounded-xl bg-bg p-3">
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <TrendingUp className="h-3.5 w-3.5" /> В работе (потенциал)
          </div>
          <div className="mt-1 text-lg font-bold text-text">{fmt(stats.pipelineRub)} ₽</div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-bg p-3">
          <ConversionRing percent={stats.conversionPercent} size={44} />
          <div>
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <Percent className="h-3.5 w-3.5" /> Конверсия
            </div>
            <div className="mt-1 text-[11px] text-text-secondary">
              {stats.conversionPercent >= CONVERSION_PREMIUM_THRESHOLD_PERCENT ? "премия 10%" : "премия 7%"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {QUOTE_STATUSES.map((status) => {
          const count = stats.statusCounts[status] ?? 0;
          if (count === 0) return null;
          return (
            <span
              key={status}
              className={cn("rounded-full px-2.5 py-1 text-xs font-medium", QUOTE_STATUS_BADGE_CLASSES[status])}
            >
              {QUOTE_STATUS_LABEL[status]} · {count}
            </span>
          );
        })}
        {stats.totalQuotes === 0 && <span className="text-xs text-text-secondary">Просчётов пока нет.</span>}
      </div>
    </>
  );
}

function ManagerDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/manager-dashboard")
      .then((res) => res.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card className="mb-4 p-4">
        <p className="text-sm text-text-secondary">Загрузка дашборда…</p>
      </Card>
    );
  }
  if (!data) return null;

  return (
    <Card className="mb-4 p-4 sm:p-5">
      <h2 className="text-sm font-bold text-text">Дашборд</h2>
      <div className="mt-3">
        <StatSummaryRow stats={data.overall} />
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-border p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
          <Sparkles className="h-3.5 w-3.5" /> KPI и премия
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          Из суммы просчётов в работе вычтены закупка товара, доставка по Китаю и доставка карго; доход компании
          дополнительно учитывает премии менеджеров. Ставка премии зависит от конверсии за всю историю: от{" "}
          {CONVERSION_PREMIUM_THRESHOLD_PERCENT}% — 10% от прибыли (выкуп, услуги и карго вместе), ниже — 7%.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-bg p-2.5">
            <div className="text-[11px] text-text-secondary">Ожидаемая премия менеджерам ({data.overall.premiumRatePercent}% от прибыли)</div>
            <div className="text-sm font-bold text-text">{fmt(data.overall.premiumRub)} ₽</div>
          </div>
          <div className="rounded-lg bg-bg p-2.5">
            <div className="text-[11px] text-text-secondary">Ожидаемый доход компании</div>
            <div className={cn("text-sm font-bold", data.expectedIncomeRub != null ? "text-success" : "text-text")}>
              {data.expectedIncomeRub != null ? `${fmt(data.expectedIncomeRub)} ₽` : "— (только у руководителя)"}
            </div>
          </div>
        </div>
      </div>

      {data.cargoProfitRub != null && data.otherProfitRub != null && (
        <div className="mt-4 rounded-xl border border-dashed border-border p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
            <Lock className="h-3.5 w-3.5" /> Разбивка дохода — видно только руководителю
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            «В работе» выше — это оборот (всё, что заплатит клиент). Здесь — сколько из него реальная прибыль, и из
            чего она складывается.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-bg p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                <Handshake className="h-3 w-3" /> Доход по выкупу и услугам
              </div>
              <div className="text-sm font-bold text-success">{fmt(data.otherProfitRub)} ₽</div>
            </div>
            <div className="rounded-lg bg-bg p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                <Ship className="h-3 w-3" /> Доход за карго
              </div>
              <div className="text-sm font-bold text-success">{fmt(data.cargoProfitRub)} ₽</div>
            </div>
          </div>
          <div className="mt-3 space-y-2 rounded-lg bg-bg p-2.5 text-[11px] text-text-secondary">
            <div>
              <span className="font-semibold text-text">Доход по выкупу и услугам</span> = услуга поиска (Standart/
              Expert/Pro) + комиссия за организацию выкупа + доп. услуги из прайс-листа. Это на 100% ваш доход — тут
              нет отдельной себестоимости, которую нужно вычитать.
            </div>
            <div>
              <span className="font-semibold text-text">Доход за карго</span> = то, что заплатил клиент за
              карго-доставку, минус её реальная себестоимость (себестоимость задаётся во вкладке «Тарифы» — общая
              для «по объёму» и отдельно по каждой категории для «по плотности»). Если клиенту дана скидка на карго —
              она вычитается из этого дохода, а не из себестоимости.
            </div>
            <div className="border-t border-border pt-2">
              <span className="font-semibold text-text">Не считается доходом (100% расход, без наценки):</span>{" "}
              стоимость самого товара и доставка по Китаю до склада — здесь наценки нет, только то, что вы платите
              за клиента.
            </div>
          </div>
        </div>
      )}

      {data.perManager && data.perManager.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold text-text-secondary">KPI по сотрудникам</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-125 border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-secondary">
                  <th className="py-1.5 font-medium">Менеджер</th>
                  <th className="py-1.5 font-medium">Просчётов</th>
                  <th className="py-1.5 font-medium">Выкуплено, ₽</th>
                  <th className="py-1.5 font-medium">Выдано, ₽</th>
                  <th className="py-1.5 font-medium">В работе, ₽</th>
                  <th className="py-1.5 font-medium">Премия, ₽</th>
                  <th className="py-1.5 font-medium">Конверсия</th>
                </tr>
              </thead>
              <tbody>
                {data.perManager.map((row) => (
                  <tr key={row.managerId} className="border-b border-border last:border-0">
                    <td className="py-1.5 font-medium text-text">{row.managerName}</td>
                    <td className="py-1.5 text-text-secondary">{row.totalQuotes}</td>
                    <td className="py-1.5 text-text-secondary">{fmt(row.boughtRub)}</td>
                    <td className="py-1.5 text-text-secondary">{fmt(row.handedRub)}</td>
                    <td className="py-1.5 text-text-secondary">{fmt(row.pipelineRub)}</td>
                    <td className="py-1.5 text-text-secondary">
                      {fmt(row.premiumRub)} <span className="text-[10px]">({row.premiumRatePercent}%)</span>
                    </td>
                    <td className="py-1.5">
                      <ConversionRing percent={row.conversionPercent} size={32} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

export { ManagerDashboard };
