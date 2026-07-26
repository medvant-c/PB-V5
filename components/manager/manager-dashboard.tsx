"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  Wallet,
  PackageCheck,
  Percent,
  Gift,
  Info,
  Lock,
  Ship,
  Handshake,
  Calendar,
  ChevronDown,
} from "lucide-react";
import { QUOTE_STATUSES, QUOTE_STATUS_LABEL, QUOTE_STATUS_BADGE_CLASSES, QUOTE_STATUS_DOT_COLOR } from "@/lib/quote-statuses";
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
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-border" />
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

// One card in the hero row — the gradient "featured" card and the three
// plain white ones all share this shape, just with different tone props.
function StatCard({
  icon: Icon,
  label,
  value,
  valueClassName,
  subtitle,
  featured,
  trailing,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  subtitle?: React.ReactNode;
  featured?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl p-5",
        featured
          ? "bg-gradient-to-br from-primary to-secondary text-white shadow-lg shadow-primary/25"
          : "border border-border bg-surface shadow-sm",
      )}
    >
      <div className={cn("flex items-center gap-2 text-sm font-medium", featured ? "text-white/85" : "text-text-secondary")}>
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            featured ? "bg-white/15" : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </div>
      <div className="mt-4 flex items-end justify-between gap-2">
        <div className={cn("text-[26px] font-extrabold leading-none", valueClassName ?? (featured ? "text-white" : "text-text"))}>
          {value}
        </div>
        {trailing}
      </div>
      {subtitle && <div className={cn("mt-2 text-xs", featured ? "text-white/70" : "text-text-secondary")}>{subtitle}</div>}
    </div>
  );
}

function StatCardsRow({ stats, expectedIncomeRub }: { stats: StatSummary; expectedIncomeRub: number | null }) {
  const isHighConversion = stats.conversionPercent >= CONVERSION_PREMIUM_THRESHOLD_PERCENT;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        featured
        icon={TrendingUp}
        label="В работе (потенциал)"
        value={`${fmt(stats.pipelineRub)} ₽`}
        subtitle={`${stats.totalQuotes} просчётов`}
      />
      <StatCard
        icon={Wallet}
        label="Доход компании"
        value={expectedIncomeRub != null ? `${fmt(expectedIncomeRub)} ₽` : "—"}
        valueClassName={expectedIncomeRub != null ? "text-success" : "text-text-secondary"}
        subtitle={expectedIncomeRub != null ? "Прибыль минус премии" : "Видно только руководителю"}
      />
      <StatCard
        icon={Gift}
        label="Ожидаемая премия"
        value={`${fmt(stats.premiumRub)} ₽`}
        subtitle={`${stats.premiumRatePercent}% от прибыли`}
      />
      <StatCard
        icon={Percent}
        label="Конверсия"
        value={`${stats.conversionPercent}%`}
        valueClassName={isHighConversion ? "text-success" : "text-error"}
        subtitle={`премия ${stats.premiumRatePercent}%`}
        trailing={<ConversionRing percent={stats.conversionPercent} size={48} />}
      />
    </div>
  );
}

function StatusPillsRow({ stats }: { stats: StatSummary }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white">
        Все · {stats.totalQuotes}
      </span>

      <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-text-secondary">
        <Wallet className="h-3.5 w-3.5" /> Выкуплено · {fmt(stats.boughtRub)} ₽
      </span>
      <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-text-secondary">
        <PackageCheck className="h-3.5 w-3.5" /> Выдано · {fmt(stats.handedRub)} ₽
      </span>

      {QUOTE_STATUSES.map((status) => {
        const count = stats.statusCounts[status] ?? 0;
        if (count === 0) return null;
        return (
          <span key={status} className={cn("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium", QUOTE_STATUS_BADGE_CLASSES[status])}>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: QUOTE_STATUS_DOT_COLOR[status] }} />
            {QUOTE_STATUS_LABEL[status]} · {count}
          </span>
        );
      })}
    </div>
  );
}

function TodayPill() {
  const [today, setToday] = useState<string | null>(null);
  // Computed client-side only — Date.now() during SSR would mismatch the
  // client's render and trigger a hydration warning for a value that isn't
  // even meaningful until the browser paints it anyway.
  useEffect(() => {
    setToday(new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }));
  }, []);
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary">
      <Calendar className="h-4 w-4" />
      {today ?? "—"}
    </div>
  );
}

function ManagerDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [incomeExplainerOpen, setIncomeExplainerOpen] = useState(true);

  useEffect(() => {
    fetch("/api/manager-dashboard")
      .then((res) => res.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-3xl border border-border bg-surface p-5">
        <p className="text-sm text-text-secondary">Загрузка дашборда…</p>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-extrabold tracking-tight text-text">Дашборд</h2>
        <TodayPill />
      </div>

      <StatCardsRow stats={data.overall} expectedIncomeRub={data.expectedIncomeRub} />
      <StatusPillsRow stats={data.overall} />

      <div className="rounded-2xl border border-border bg-bg p-4 sm:p-5">
        <div className="flex items-center gap-1.5 text-sm font-bold text-text">
          <Info className="h-4 w-4 text-text-secondary" /> KPI и премия
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
          Из суммы просчётов в работе вычтены закупка товара, доставка по Китаю и доставка карго; доход компании
          дополнительно учитывает премии менеджеров. Ставка премии зависит от конверсии за всю историю: от{" "}
          {CONVERSION_PREMIUM_THRESHOLD_PERCENT}% — 10% от прибыли (выкуп, услуги и карго вместе), ниже — 7%.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-3.5">
            <div className="text-xs text-text-secondary">Ожидаемая премия менеджерам ({data.overall.premiumRatePercent}% от прибыли)</div>
            <div className="mt-1 text-lg font-bold text-text">{fmt(data.overall.premiumRub)} ₽</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3.5">
            <div className="text-xs text-text-secondary">Ожидаемый доход компании</div>
            <div className={cn("mt-1 text-lg font-bold", data.expectedIncomeRub != null ? "text-success" : "text-text")}>
              {data.expectedIncomeRub != null ? `${fmt(data.expectedIncomeRub)} ₽` : "— (только у руководителя)"}
            </div>
          </div>
        </div>
      </div>

      {data.cargoProfitRub != null && data.otherProfitRub != null && (
        <div className="rounded-2xl border border-border bg-bg p-4 sm:p-5">
          <div className="flex items-center gap-1.5 text-sm font-bold text-text">
            <Lock className="h-4 w-4 text-text-secondary" /> Разбивка дохода — видно только руководителю
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
            «В работе» выше — это оборот (всё, что заплатит клиент). Здесь — сколько из него реальная прибыль, и из
            чего она складывается.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface p-3.5">
              <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                <Handshake className="h-3.5 w-3.5" /> Доход по выкупу и услугам
              </div>
              <div className="mt-1 text-lg font-bold text-success">{fmt(data.otherProfitRub)} ₽</div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3.5">
              <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                <Ship className="h-3.5 w-3.5" /> Доход за карго
              </div>
              <div className="mt-1 text-lg font-bold text-success">{fmt(data.cargoProfitRub)} ₽</div>
            </div>
          </div>

          {incomeExplainerOpen && (
            <div className="mt-3 space-y-2 rounded-xl border border-border bg-surface p-3.5 text-xs leading-relaxed text-text-secondary">
              <div>
                <span className="font-semibold text-text">Доход по выкупу и услугам</span> = услуга поиска (Standart/
                Expert/Pro) + комиссия за организацию выкупа + доп. услуги из прайс-листа. Это на 100% ваш доход — тут
                нет отдельной себестоимости, которую нужно вычитать.
              </div>
              <div>
                <span className="font-semibold text-text">Доход за карго</span> = то, что заплатил клиент за
                карго-доставку, минус её реальная себестоимость (себестоимость задаётся во вкладке «Тарифы» — общая
                для «по объёму» и отдельно по каждой категории для «по плотности»). Если клиенту дана скидка на
                карго — она вычитается из этого дохода, а не из себестоимости.
              </div>
              <div className="border-t border-border pt-2">
                <span className="font-semibold text-text">Не считается доходом (100% расход, без наценки):</span>{" "}
                стоимость самого товара и доставка по Китаю до склада — здесь наценки нет, только то, что вы платите
                за клиента.
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIncomeExplainerOpen((v) => !v)}
            className="mt-2 flex w-full items-center justify-end gap-1 text-xs font-medium text-text-secondary transition-colors hover:text-primary"
          >
            <Info className="h-3.5 w-3.5" /> Как считается доход
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", incomeExplainerOpen && "rotate-180")} />
          </button>
        </div>
      )}

      {data.perManager && data.perManager.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <h3 className="text-sm font-bold text-text">KPI по сотрудникам</h3>
          <div className="mt-3 overflow-x-auto">
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
    </div>
  );
}

export { ManagerDashboard };
