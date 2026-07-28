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
  Loader2,
  ImageOff,
  Download,
} from "lucide-react";
import { QUOTE_STATUSES, QUOTE_STATUS_LABEL, QUOTE_STATUS_BADGE_CLASSES, QUOTE_STATUS_DOT_COLOR } from "@/lib/quote-statuses";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface StatSummary {
  statusCounts: Record<string, number>;
  totalQuotes: number;
  boughtRub: number;
  handedRub: number;
  pipelineRub: number;
  pipelineGoodsRub: number;
  pipelineChinaDeliveryRub: number;
  pipelineCargoRub: number;
  potentialProscetRub: number;
  potentialBuyoutRub: number;
  factualProscetRub: number;
  factualBuyoutRub: number;
  factualDiscountRub: number;
  potentialCargoProfitRub: number;
  factualCargoProfitRub: number;
  potentialCargoBonusRub: number;
  factualCargoBonusRub: number;
  // Фулфилмент — flat 10% of billed amount, no potential/factual split
  // (recognized the moment the order is saved) — see PB-V5 chat
  // 2026-07-28.
  factualFulfillmentPremiumRub: number;
  estimatedPremiumRub: number;
  factualPremiumRub: number;
  conversionPercent: number;
}

// Purely informational now — conversion no longer decides the premium rate
// (flat 10%, or 35% for a confirmed self-sourced client; see
// app/api/manager-dashboard/route.ts) — kept only as a "is this a healthy
// close rate" color threshold for the ring below.
const CONVERSION_HEALTHY_THRESHOLD_PERCENT = 60;

// Small SVG donut — a glanceable visual for the manager's all-time close
// rate instead of just another number in a row of numbers.
function ConversionRing({ percent, size = 56 }: { percent: number; size?: number }) {
  const isHigh = percent >= CONVERSION_HEALTHY_THRESHOLD_PERCENT;
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

// Enough fields to render one row of the click-to-filter quote list below
// the status pills — a subset of what GET /api/manager-quotes returns.
interface QuoteListItem {
  id: string;
  displayId: number;
  productName: string;
  status: string;
  totalRub: string;
  createdAt: string;
  firstPhotoId: string | null;
  client: { name: string; company: string | null };
}

interface DashboardData {
  overall: StatSummary;
  perManager: PerManagerRow[] | null;
  // Owner-only company-wide income — potential (if everything open gets
  // bought/actualized/handed over as currently estimated) and factual (only
  // what's actually been confirmed), each already net of every manager's
  // own premium for that same scope. null for everyone else.
  expectedIncomeRub: number | null;
  actualIncomeRub: number | null;
  // Owner-only source breakdown behind those two totals.
  potentialProscetRub: number | null;
  potentialBuyoutRub: number | null;
  factualProscetRub: number | null;
  factualBuyoutRub: number | null;
  factualDiscountRub: number | null;
  potentialCargoProfitRub: number | null;
  factualCargoProfitRub: number | null;
  // Owner-only companions — physical totals and the two revenue lines
  // behind "Доход компании".
  cargoVolumeM3: number | null;
  cargoWeightKg: number | null;
  searchFeeRub: number | null;
  buyoutCommissionRub: number | null;
  // Owner-only — Влад's 10% cut and what's left for the two founders
  // (Александр/Антон, 50/50) after Влад and every manager's premium — see
  // PB-V5 chat 2026-07-28.
  vladShareRub: number | null;
  founderShareRub: number | null;
}

function fmt(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

// One row inside a hover breakdown — label left, ₽ value right, an
// optional bold+border-top styling for the final "Итого" line. Same visual
// idiom as quoteBreakdown()'s tooltip rows in clients-tab.tsx.
function BreakdownRow({ label, value, isTotal }: { label: string; value: string; isTotal?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4", isTotal && "border-t border-surface/25 pt-1 font-bold")}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// One card in the hero row — the gradient "featured" card and the plain
// white ones all share this shape, just with different tone props.
// `tooltip`, when given, wraps the whole card so hovering anywhere on it
// (not just the number) reveals what the figure is made of.
function StatCard({
  icon: Icon,
  label,
  value,
  valueClassName,
  subtitle,
  featured,
  trailing,
  tooltip,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  subtitle?: React.ReactNode;
  featured?: boolean;
  trailing?: React.ReactNode;
  tooltip?: React.ReactNode;
}) {
  const card = (
    <div
      className={cn(
        "h-full rounded-3xl p-5",
        featured
          ? "bg-gradient-to-br from-primary to-secondary text-white shadow-lg shadow-primary/25"
          : "border border-border bg-surface shadow-sm",
        tooltip && "cursor-help",
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

  if (!tooltip) return card;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent side="bottom" className="w-64">
        <div className="space-y-1">{tooltip}</div>
      </TooltipContent>
    </Tooltip>
  );
}

function StatCardsRow({
  stats,
  expectedIncomeRub,
  actualIncomeRub,
}: {
  stats: StatSummary;
  expectedIncomeRub: number | null;
  actualIncomeRub: number | null;
}) {
  const isHighConversion = stats.conversionPercent >= CONVERSION_HEALTHY_THRESHOLD_PERCENT;

  // Residual, not a tracked field — guarantees the four rows always sum to
  // exactly pipelineRub instead of drifting from a separately-summed value.
  const pipelineServicesRub = stats.pipelineRub - stats.pipelineGoodsRub - stats.pipelineChinaDeliveryRub - stats.pipelineCargoRub;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        featured
        icon={TrendingUp}
        label="В работе (потенциал)"
        value={`${fmt(stats.pipelineRub)} ₽`}
        subtitle={`${stats.totalQuotes} просчётов`}
        tooltip={
          <>
            <BreakdownRow label="Товар" value={`${fmt(stats.pipelineGoodsRub)} ₽`} />
            <BreakdownRow label="Доставка по Китаю" value={`${fmt(stats.pipelineChinaDeliveryRub)} ₽`} />
            <BreakdownRow label="Доставка карго" value={`${fmt(stats.pipelineCargoRub)} ₽`} />
            <BreakdownRow label="Услуги и комиссии" value={`${fmt(pipelineServicesRub)} ₽`} />
            <BreakdownRow label="Итого в работе" value={`${fmt(stats.pipelineRub)} ₽`} isTotal />
          </>
        }
      />
      <StatCard
        icon={Percent}
        label="Конверсия"
        value={`${stats.conversionPercent}%`}
        valueClassName={isHighConversion ? "text-success" : "text-error"}
        subtitle="справочно — на премию больше не влияет"
        tooltip={
          <p>
            Общая конверсия по всем сотрудникам вместе: выкупленные просчёты ÷ просчёты без учёта отказов. Не среднее
            арифметическое процентов по сотрудникам — просчёты считаются все вместе, в одном пуле. Ставка премии
            теперь не зависит от неё — 10% от прибыли всегда, 35% для подтверждённых личных клиентов.
          </p>
        }
        trailing={<ConversionRing percent={stats.conversionPercent} size={48} />}
      />
      <StatCard
        icon={Gift}
        label="Премия менеджерам"
        value={`${fmt(stats.factualPremiumRub)} ₽`}
        valueClassName="text-success"
        subtitle={`ожидается ещё ${fmt(stats.estimatedPremiumRub)} ₽`}
        tooltip={
          <>
            <BreakdownRow label="Факт — просчёт" value={`${fmt(Math.max(0, stats.factualProscetRub))} ₽ прибыли`} />
            <BreakdownRow label="Факт — выкуп" value={`${fmt(Math.max(0, stats.factualBuyoutRub))} ₽ прибыли`} />
            <BreakdownRow label="Факт — скидка поставщика" value={`${fmt(Math.max(0, stats.factualDiscountRub))} ₽ прибыли`} />
            <BreakdownRow
              label="Факт — премия"
              value={`${fmt(stats.factualPremiumRub - stats.factualCargoBonusRub - stats.factualFulfillmentPremiumRub)} ₽`}
            />
            <BreakdownRow label="Факт — бонус за карго" value={`${fmt(stats.factualCargoBonusRub)} ₽`} />
            <BreakdownRow label="Факт — фулфилмент" value={`${fmt(stats.factualFulfillmentPremiumRub)} ₽`} />
            <BreakdownRow label="Итого фактическая премия" value={`${fmt(stats.factualPremiumRub)} ₽`} isTotal />
            <div className="pt-2 text-[11px] text-white/60">Ниже — то, что ещё не подтверждено (потенциал):</div>
            <BreakdownRow label="Потенциал — премия за услуги" value={`${fmt(stats.estimatedPremiumRub - stats.potentialCargoBonusRub)} ₽`} />
            <BreakdownRow label="Потенциал — бонус за карго" value={`${fmt(stats.potentialCargoBonusRub)} ₽`} />
            <BreakdownRow label="Итого ожидаемая премия" value={`${fmt(stats.estimatedPremiumRub)} ₽`} isTotal />
          </>
        }
      />
      <StatCard
        icon={Wallet}
        label="Доход компании (факт)"
        value={actualIncomeRub != null ? `${fmt(actualIncomeRub)} ₽` : "—"}
        valueClassName={actualIncomeRub != null ? "text-success" : "text-text-secondary"}
        subtitle={actualIncomeRub != null ? "Уже подтверждено" : "Видно только руководителю"}
      />
      <StatCard
        icon={Wallet}
        label="Доход компании (потенциал)"
        value={expectedIncomeRub != null ? `${fmt(expectedIncomeRub)} ₽` : "—"}
        valueClassName={expectedIncomeRub != null ? "text-success" : "text-text-secondary"}
        subtitle={expectedIncomeRub != null ? "Если всё в работе будет куплено" : "Видно только руководителю"}
      />
    </div>
  );
}

// Mirrors BOUGHT_STATUSES in app/api/manager-dashboard/route.ts — "выкуплено"
// is a multi-status aggregate (client paid, cargo not yet handed over),
// duplicated here the same way CONVERSION_HEALTHY_THRESHOLD_PERCENT already is.
const BOUGHT_STATUSES = ["in_transit_to_warehouse", "delivered_to_warehouse", "sent_to_client", "handed_to_client"];

interface PillFilter {
  key: string;
  statuses: string[] | null; // null = every status ("Все")
}

function StatusPillsRow({
  stats,
  activeFilter,
  onSelect,
}: {
  stats: StatSummary;
  activeFilter: string | null;
  onSelect: (filter: PillFilter) => void;
}) {
  function pillClass(key: string, colored?: string) {
    const isActive = activeFilter === key;
    return cn(
      "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-shadow",
      isActive && "ring-2 ring-offset-1 ring-primary",
      colored,
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => onSelect({ key: "all", statuses: null })} className={pillClass("all", "bg-primary font-semibold text-white")}>
        Все · {stats.totalQuotes}
      </button>

      <button
        type="button"
        onClick={() => onSelect({ key: "bought", statuses: BOUGHT_STATUSES })}
        className={pillClass("bought", "border border-border bg-surface text-text-secondary")}
      >
        <Wallet className="h-3.5 w-3.5" /> Выкуплено · {fmt(stats.boughtRub)} ₽
      </button>
      <button
        type="button"
        onClick={() => onSelect({ key: "handed_to_client", statuses: ["handed_to_client"] })}
        className={pillClass("handed_to_client", "border border-border bg-surface text-text-secondary")}
      >
        <PackageCheck className="h-3.5 w-3.5" /> Выдано · {fmt(stats.handedRub)} ₽
      </button>

      {QUOTE_STATUSES.map((status) => {
        const count = stats.statusCounts[status] ?? 0;
        if (count === 0) return null;
        return (
          <button key={status} type="button" onClick={() => onSelect({ key: status, statuses: [status] })} className={pillClass(status, QUOTE_STATUS_BADGE_CLASSES[status])}>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: QUOTE_STATUS_DOT_COLOR[status] }} />
            {QUOTE_STATUS_LABEL[status]} · {count}
          </button>
        );
      })}
    </div>
  );
}

function QuoteListPanel({ quotes, loading }: { quotes: QuoteListItem[] | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-border bg-surface p-4 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" /> Загрузка просчётов…
      </div>
    );
  }
  if (!quotes || quotes.length === 0) {
    return (
      <div className="mt-3 rounded-2xl border border-border bg-surface p-4 text-sm text-text-secondary">
        Нет просчётов с этим статусом.
      </div>
    );
  }

  return (
    <div className="mt-3 divide-y divide-border rounded-2xl border border-border bg-surface">
      {quotes.map((quote) => (
        <a key={quote.id} href={`/api/manager-quotes/${quote.id}/pdf`} className="flex items-center gap-3 p-3 text-sm transition-colors hover:bg-bg">
          {quote.firstPhotoId ? (
            // eslint-disable-next-line @next/next/no-img-element -- session-gated API route, not a static asset
            <img src={`/api/manager-quotes/photos/${quote.firstPhotoId}`} alt="" className="h-9 w-9 shrink-0 rounded-md border border-border object-cover" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-text-secondary">
              <ImageOff className="h-4 w-4" />
            </div>
          )}
          <Download className="h-4 w-4 shrink-0 text-text-secondary" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-text">
              №{quote.displayId} · {quote.productName}
            </div>
            <div className="truncate text-xs text-text-secondary">
              {quote.client.name}
              {quote.client.company ? ` · ${quote.client.company}` : ""}
            </div>
          </div>
          <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", QUOTE_STATUS_BADGE_CLASSES[quote.status as keyof typeof QUOTE_STATUS_BADGE_CLASSES])}>
            {QUOTE_STATUS_LABEL[quote.status as keyof typeof QUOTE_STATUS_LABEL] ?? quote.status}
          </span>
          <span className="w-28 shrink-0 text-right font-bold text-text">{fmt(Number(quote.totalRub))} ₽</span>
        </a>
      ))}
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

  // The pill row's own list panel — quotes are fetched once (all statuses,
  // across every client this manager can see) and filtered client-side per
  // click, rather than re-fetching per pill.
  const [activeFilter, setActiveFilter] = useState<PillFilter | null>(null);
  const [allQuotes, setAllQuotes] = useState<QuoteListItem[] | null>(null);
  const [loadingQuotes, setLoadingQuotes] = useState(false);

  useEffect(() => {
    fetch("/api/manager-dashboard")
      .then((res) => res.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  function handlePillSelect(filter: PillFilter) {
    setActiveFilter((current) => (current?.key === filter.key ? null : filter));
    if (allQuotes === null) {
      setLoadingQuotes(true);
      fetch("/api/manager-quotes")
        .then((res) => res.json())
        .then((d) => setAllQuotes(d.quotes ?? []))
        .finally(() => setLoadingQuotes(false));
    }
  }

  const filteredQuotes =
    activeFilter && allQuotes
      ? activeFilter.statuses
        ? allQuotes.filter((q) => activeFilter.statuses!.includes(q.status))
        : allQuotes
      : null;

  if (loading) {
    return (
      <div className="rounded-3xl border border-border bg-surface p-5">
        <p className="text-sm text-text-secondary">Загрузка дашборда…</p>
      </div>
    );
  }
  if (!data) return null;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-extrabold tracking-tight text-text">Дашборд</h2>
          <TodayPill />
        </div>

        <StatCardsRow stats={data.overall} expectedIncomeRub={data.expectedIncomeRub} actualIncomeRub={data.actualIncomeRub} />
        <StatusPillsRow stats={data.overall} activeFilter={activeFilter?.key ?? null} onSelect={handlePillSelect} />
        {activeFilter && <QuoteListPanel quotes={filteredQuotes} loading={loadingQuotes} />}

        <div className="rounded-2xl border border-border bg-bg p-4 sm:p-5">
          <div className="flex items-center gap-1.5 text-sm font-bold text-text">
            <Info className="h-4 w-4 text-text-secondary" /> Как считается премия
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
            <span className="font-semibold text-text">Просчёт</span> — 10% от прибыли для обычного клиента (лид
            компании), 100% для подтверждённого личного клиента менеджера.{" "}
            <span className="font-semibold text-text">Выкуп и Скидка поставщика</span> — 10% для обычного клиента,
            50% для личного клиента. Всё по факту, как только старший менеджер или руководитель подтвердит реальную
            сумму выкупа.
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
            <span className="font-semibold text-text">Карго и Фулфилмент</span> — премия менеджеру только для
            подтверждённого личного клиента: карго — фиксированная ставка $/кг или $/м³ (задаётся во вкладке
            «Тарифы»), фулфилмент — 10% от выставленной суммы. Для лида компании менеджер с карго и фулфилмента
            ничего не получает.
          </p>
        </div>

        {data.potentialProscetRub != null &&
          data.potentialBuyoutRub != null &&
          data.factualProscetRub != null &&
          data.factualBuyoutRub != null &&
          data.factualDiscountRub != null &&
          data.potentialCargoProfitRub != null &&
          data.factualCargoProfitRub != null && (
            <div className="rounded-2xl border border-border bg-bg p-4 sm:p-5">
              <div className="flex items-center gap-1.5 text-sm font-bold text-text">
                <Lock className="h-4 w-4 text-text-secondary" /> Разбивка дохода — видно только руководителю
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
                «В работе» выше — это оборот (всё, что заплатит клиент). Здесь — сколько из него реальная прибыль
                компании, по источникам (Просчёт + Выкуп, Скидка поставщика, Карго), и отдельно — что уже
                подтверждено (факт), а что ещё оценка (потенциал).
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-surface p-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Handshake className="h-3.5 w-3.5" /> Просчёт + Выкуп — потенциал
                  </div>
                  <div className="mt-1 text-lg font-bold text-text">{fmt(data.potentialProscetRub + data.potentialBuyoutRub)} ₽</div>
                </div>
                <div className="rounded-xl border border-border bg-surface p-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Handshake className="h-3.5 w-3.5" /> Просчёт + Выкуп — факт
                  </div>
                  <div className="mt-1 text-lg font-bold text-success">{fmt(data.factualProscetRub + data.factualBuyoutRub)} ₽</div>
                </div>
                <div className="rounded-xl border border-border bg-surface p-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Handshake className="h-3.5 w-3.5" /> Скидка поставщика — факт
                  </div>
                  <div className="mt-1 text-lg font-bold text-success">{fmt(data.factualDiscountRub)} ₽</div>
                </div>
                <div className="rounded-xl border border-border bg-surface p-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Ship className="h-3.5 w-3.5" /> Карго — потенциал
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-lg font-bold text-text">{fmt(data.potentialCargoProfitRub)} ₽</span>
                    {data.cargoVolumeM3 != null && data.cargoWeightKg != null && (
                      <span className="text-xs text-text-secondary">
                        {data.cargoVolumeM3.toFixed(1)} м³ · {fmt(data.cargoWeightKg)} кг
                      </span>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-surface p-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Ship className="h-3.5 w-3.5" /> Карго — факт
                  </div>
                  <div className="mt-1 text-lg font-bold text-success">{fmt(data.factualCargoProfitRub)} ₽</div>
                </div>
              </div>

              {incomeExplainerOpen && (
                <div className="mt-3 space-y-2 rounded-xl border border-border bg-surface p-3.5 text-xs leading-relaxed text-text-secondary">
                  <div>
                    <span className="font-semibold text-text">Просчёт</span> = услуга поиска (Standart/Expert/Pro).{" "}
                    <span className="font-semibold text-text">Выкуп</span> = комиссия за организацию выкупа + доп.
                    услуги из прайс-листа + разница между плановой ценой товара и тем, что реально потрачено на
                    выкуп.
                  </div>
                  <div>
                    <span className="font-semibold text-text">Скидка поставщика</span> — дополнительная скидка
                    фабрики сверх плановой цены, вводится вручную вместе с фактом выкупа. Отдельный источник, не
                    входит в «Выкуп» выше.
                  </div>
                  <div>
                    Потенциал считает разницу план/факт как 0, пока старший менеджер или руководитель не подтвердит
                    реальную сумму выкупа — тогда просчёт переходит в факт.
                  </div>
                  <div>
                    <span className="font-semibold text-text">Карго</span> = то, что заплатил клиент за
                    карго-доставку, минус её реальная себестоимость (задаётся во вкладке «Тарифы»). В факт попадает
                    только при статусе «Выдан клиенту» — до этого, даже если реальные габариты уже внесены, доход
                    числится в потенциале.
                  </div>
                  <div className="border-t border-border pt-2">
                    <span className="font-semibold text-text">Не считается доходом (100% расход, без наценки):</span>{" "}
                    стоимость самого товара по плану и доставка по Китаю до склада.
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

        {data.vladShareRub != null && data.founderShareRub != null && (
          <div className="rounded-2xl border border-border bg-bg p-4 sm:p-5">
            <div className="flex items-center gap-1.5 text-sm font-bold text-text">
              <Lock className="h-4 w-4 text-text-secondary" /> Доля партнёров — видно только руководителю
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
              10% от прибыли по каждой подтверждённой сделке (со всех источников, включая курсовую разницу) —
              Владу. Остаток после доли Влада и премий всех менеджеров делится 50/50 между Александром и Антоном.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-surface p-3.5">
                <div className="text-xs text-text-secondary">Влад (Партнёр) — 10%</div>
                <div className="mt-1 text-lg font-bold text-text">{fmt(data.vladShareRub)} ₽</div>
              </div>
              <div className="rounded-xl border border-border bg-surface p-3.5">
                <div className="text-xs text-text-secondary">Александр (Основатель/Инвестор)</div>
                <div className="mt-1 text-lg font-bold text-text">{fmt(data.founderShareRub)} ₽</div>
              </div>
              <div className="rounded-xl border border-border bg-surface p-3.5">
                <div className="text-xs text-text-secondary">Антон</div>
                <div className="mt-1 text-lg font-bold text-text">{fmt(data.founderShareRub)} ₽</div>
              </div>
            </div>
          </div>
        )}

        {data.perManager && data.perManager.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <h3 className="text-sm font-bold text-text">KPI по сотрудникам</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-150 border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-text-secondary">
                    <th className="py-1.5 font-medium">Менеджер</th>
                    <th className="py-1.5 font-medium">Просчётов</th>
                    <th className="py-1.5 font-medium">Выкуплено, ₽</th>
                    <th className="py-1.5 font-medium">Выдано, ₽</th>
                    <th className="py-1.5 font-medium">В работе, ₽</th>
                    <th className="py-1.5 font-medium">Премия факт, ₽</th>
                    <th className="py-1.5 font-medium">Премия потенциал, ₽</th>
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
                      <td className="py-1.5 font-semibold text-success">{fmt(row.factualPremiumRub)}</td>
                      <td className="py-1.5 text-text-secondary">{fmt(row.estimatedPremiumRub)}</td>
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
    </TooltipProvider>
  );
}

export { ManagerDashboard };
