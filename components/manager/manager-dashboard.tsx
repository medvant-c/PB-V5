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
  AlertTriangle,
  Inbox,
  Clock,
} from "lucide-react";
import { QUOTE_STATUSES, QUOTE_STATUS_LABEL, QUOTE_STATUS_BADGE_CLASSES, QUOTE_STATUS_DOT_COLOR } from "@/lib/quote-statuses";
import { cn } from "@/lib/utils";
import { QuoteDialog } from "@/components/manager/quote-dialog";
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
// (see the per-source rates in app/api/manager-dashboard/route.ts) — kept
// only as a "is this a healthy
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
  completedToday: number;
  completedWeek: number;
  completedMonth: number;
}

// Enough fields to render one row of the click-to-filter quote list below
// the status pills — a subset of what GET /api/manager-quotes returns.
interface QuoteListItem {
  id: string;
  clientId: string;
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
  // Every ₽ amount on this dashboard is displayed converted to ¥ using this
  // rate (see PB-V5 chat 2026-07-28) — underlying storage/math stays RUB,
  // only the presentation changes.
  cnyRateRub: number;
  // Owner-editable from Настройки (see SystemSettings in
  // prisma/schema.prisma) — rendered via FormattedText below, replacing
  // what used to be hardcoded JSX here.
  premiumExplanationText: string;
  incomeSummaryText: string;
  incomeDetailText: string;
}

// Renders owner-editable hint text (see SystemSettings.premiumExplanationText
// etc.) with the one bit of rich formatting that text actually needs:
// "\n\n" starts a new paragraph, "**слово**" renders bold — same visual
// result as the JSX these blocks used to be hardcoded as, just editable
// from Настройки now instead of a code change. Plain string interpolation
// only (no HTML), so there's no injection surface even though the text is
// manager-entered.
function FormattedText({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {text.split("\n\n").map((paragraph, i) => (
        <p key={i} className={cn("mt-1.5 text-xs leading-relaxed text-text-secondary", className)}>
          {paragraph.split(/(\*\*[^*]+\*\*)/g).map((chunk, j) =>
            chunk.startsWith("**") && chunk.endsWith("**") ? (
              <span key={j} className="font-semibold text-text">
                {chunk.slice(2, -2)}
              </span>
            ) : (
              chunk
            ),
          )}
        </p>
      ))}
    </>
  );
}

function fmt(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

// Every monetary figure on this dashboard renders in ¥, not ₽ — the values
// coming from the API are still RUB internally (that's what quotes are
// priced in), converted here purely for display.
function fmtCny(rub: number, cnyRateRub: number): string {
  return fmt(rub / cnyRateRub);
}

// "X ¥ (Y ₽)" — every dashboard money figure shows both at once (see PB-V5
// chat 2026-07-29): ¥ is what the business actually thinks in, ₽ alongside
// it since that's still what's stored/quoted internally.
function fmtBoth(rub: number, cnyRateRub: number): string {
  return `${fmtCny(rub, cnyRateRub)} ¥ (${fmt(rub)} ₽)`;
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
  cnyRateRub,
  potentialProscetRub,
  potentialBuyoutRub,
  potentialCargoProfitRub,
  factualProscetRub,
  factualBuyoutRub,
  factualDiscountRub,
  factualCargoProfitRub,
}: {
  stats: StatSummary;
  expectedIncomeRub: number | null;
  actualIncomeRub: number | null;
  cnyRateRub: number;
  potentialProscetRub: number | null;
  potentialBuyoutRub: number | null;
  potentialCargoProfitRub: number | null;
  factualProscetRub: number | null;
  factualBuyoutRub: number | null;
  factualDiscountRub: number | null;
  factualCargoProfitRub: number | null;
}) {
  const isHighConversion = stats.conversionPercent >= CONVERSION_HEALTHY_THRESHOLD_PERCENT;
  const m = (rub: number) => fmtBoth(rub, cnyRateRub);

  // Residual, not a tracked field — guarantees the four rows always sum to
  // exactly pipelineRub instead of drifting from a separately-summed value.
  const pipelineServicesRub = stats.pipelineRub - stats.pipelineGoodsRub - stats.pipelineChinaDeliveryRub - stats.pipelineCargoRub;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        featured
        icon={TrendingUp}
        label="В работе (потенциал)"
        value={`${m(stats.pipelineRub)}`}
        subtitle={`${stats.totalQuotes} просчётов`}
        tooltip={
          <>
            <BreakdownRow label="Товар" value={`${m(stats.pipelineGoodsRub)}`} />
            <BreakdownRow label="Доставка по Китаю" value={`${m(stats.pipelineChinaDeliveryRub)}`} />
            <BreakdownRow label="Доставка карго" value={`${m(stats.pipelineCargoRub)}`} />
            <BreakdownRow label="Услуги и комиссии" value={`${m(pipelineServicesRub)}`} />
            <BreakdownRow label="Итого в работе" value={`${m(stats.pipelineRub)}`} isTotal />
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
            арифметическое процентов по сотрудникам — просчёты считаются все вместе, в одном пуле. Ставка премии от
            неё не зависит — подробнее в блоке «Как считается премия» ниже.
          </p>
        }
        trailing={<ConversionRing percent={stats.conversionPercent} size={48} />}
      />
      <StatCard
        icon={Gift}
        label="Премия менеджерам"
        value={`${m(stats.factualPremiumRub)}`}
        valueClassName="text-success"
        subtitle={`ожидается ещё ${m(stats.estimatedPremiumRub)}`}
        tooltip={
          <>
            <BreakdownRow label="Факт — просчёт" value={`${m(Math.max(0, stats.factualProscetRub))} прибыли`} />
            <BreakdownRow label="Факт — выкуп" value={`${m(Math.max(0, stats.factualBuyoutRub))} прибыли`} />
            <BreakdownRow label="Факт — скидка поставщика" value={`${m(Math.max(0, stats.factualDiscountRub))} прибыли`} />
            <BreakdownRow
              label="Факт — премия"
              value={`${m(stats.factualPremiumRub - stats.factualCargoBonusRub - stats.factualFulfillmentPremiumRub)}`}
            />
            <BreakdownRow label="Факт — бонус за карго" value={`${m(stats.factualCargoBonusRub)}`} />
            <BreakdownRow label="Факт — фулфилмент" value={`${m(stats.factualFulfillmentPremiumRub)}`} />
            <BreakdownRow label="Итого фактическая премия" value={`${m(stats.factualPremiumRub)}`} isTotal />
            <div className="pt-2 text-[11px] text-white/60">Ниже — то, что ещё не подтверждено (потенциал):</div>
            <BreakdownRow label="Потенциал — премия за услуги" value={`${m(stats.estimatedPremiumRub - stats.potentialCargoBonusRub)}`} />
            <BreakdownRow label="Потенциал — бонус за карго" value={`${m(stats.potentialCargoBonusRub)}`} />
            <BreakdownRow label="Итого ожидаемая премия" value={`${m(stats.estimatedPremiumRub)}`} isTotal />
          </>
        }
      />
      {actualIncomeRub != null && expectedIncomeRub != null && (
        <>
          <StatCard
            icon={Wallet}
            label="Доход компании (факт)"
            value={`${m(actualIncomeRub)}`}
            valueClassName="text-success"
            subtitle="Уже подтверждено"
            tooltip={
              <>
                <BreakdownRow label="Просчёт (факт)" value={m(factualProscetRub ?? 0)} />
                <BreakdownRow label="Выкуп (факт)" value={m(factualBuyoutRub ?? 0)} />
                <BreakdownRow label="Скидка поставщика (факт)" value={m(factualDiscountRub ?? 0)} />
                <BreakdownRow label="Карго (факт)" value={m(factualCargoProfitRub ?? 0)} />
                <BreakdownRow label="Премии менеджерам" value={`−${m(stats.factualPremiumRub)}`} />
                <BreakdownRow label="Итого доход (факт)" value={m(actualIncomeRub)} isTotal />
              </>
            }
          />
          <StatCard
            icon={Wallet}
            label="Доход компании (потенциал)"
            value={`${m(expectedIncomeRub)}`}
            valueClassName="text-success"
            subtitle="Если всё в работе будет куплено"
            tooltip={
              <>
                <BreakdownRow label="Просчёт (потенциал)" value={m(potentialProscetRub ?? 0)} />
                <BreakdownRow label="Выкуп (потенциал)" value={m(potentialBuyoutRub ?? 0)} />
                <BreakdownRow label="Карго (потенциал)" value={m(potentialCargoProfitRub ?? 0)} />
                <BreakdownRow label="Премии менеджерам" value={`−${m(stats.estimatedPremiumRub)}`} />
                <BreakdownRow label="Итого доход (потенциал)" value={m(expectedIncomeRub)} isTotal />
              </>
            }
          />
        </>
      )}
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
  cnyRateRub,
}: {
  stats: StatSummary;
  activeFilter: string | null;
  onSelect: (filter: PillFilter) => void;
  cnyRateRub: number;
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
        <Wallet className="h-3.5 w-3.5" /> Выкуплено · {fmtBoth(stats.boughtRub, cnyRateRub)}
      </button>
      <button
        type="button"
        onClick={() => onSelect({ key: "handed_to_client", statuses: ["handed_to_client"] })}
        className={pillClass("handed_to_client", "border border-border bg-surface text-text-secondary")}
      >
        <PackageCheck className="h-3.5 w-3.5" /> Выдано · {fmtBoth(stats.handedRub, cnyRateRub)}
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

function QuoteListPanel({
  quotes,
  loading,
  cnyRateRub,
}: {
  quotes: QuoteListItem[] | null;
  loading: boolean;
  cnyRateRub: number;
}) {
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
          <span className="w-28 shrink-0 text-right font-bold text-text">{fmtBoth(Number(quote.totalRub), cnyRateRub)}</span>
        </a>
      ))}
    </div>
  );
}

// Guangzhou/Moscow are where the two sides of the business actually sit;
// Bishkek/Almaty are added per explicit request (see PB-V5 chat
// 2026-07-29) — everyone on the team benefits from a shared, always-live
// read of what time it is in every city that matters to a deal, without
// doing the UTC math by hand.
const WORLD_CLOCK_CITIES = [
  { label: "Гуанчжоу", timeZone: "Asia/Shanghai" },
  { label: "Москва", timeZone: "Europe/Moscow" },
  { label: "Бишкек", timeZone: "Asia/Bishkek" },
  { label: "Алматы", timeZone: "Asia/Almaty" },
] as const;

function WorldClockWidget() {
  const [now, setNow] = useState<Date | null>(null);
  // Same "compute client-side only" reasoning as TodayPill below — a
  // ticking clock can never match between server and client anyway, and
  // it isn't meaningful until the browser paints it.
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {WORLD_CLOCK_CITIES.map((city) => (
        <div
          key={city.timeZone}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary"
        >
          <Clock className="h-3.5 w-3.5" />
          {city.label}
          <span className="font-mono text-sm font-bold tabular-nums text-text">
            {now ? now.toLocaleTimeString("ru-RU", { timeZone: city.timeZone, hour12: false }) : "--:--:--"}
          </span>
        </div>
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

interface QuoteDraftItem {
  id: string;
  note: string;
  quantity: number | null;
  createdAt: string;
  manager: { id: string; name: string } | null;
  client: { id: string; name: string; company: string | null };
}

// Aggregates QuoteDraftRequest across every client this manager can see
// (GET /api/manager-quote-drafts with no clientId filter) — the dashboard
// counterpart to the per-client badge in clients-tab.tsx, so a manager
// doesn't have to open every client to notice an unhandled search request.
// See PB-V5 chat 2026-07-28.
function SearchDraftsWidget() {
  const [drafts, setDrafts] = useState<QuoteDraftItem[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/manager-quote-drafts")
      .then((res) => res.json())
      .then((d) => setDrafts(d.drafts ?? []));
  }, []);

  if (!drafts || drafts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4 sm:p-5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-1.5 text-sm font-bold text-warning">
          <AlertTriangle className="h-4 w-4" /> Заявки на поиск — необработанные: {drafts.length}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-warning transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="mt-3 space-y-1.5">
          {drafts.map((draft) => (
            <li key={draft.id} className="rounded-lg border border-warning/20 bg-surface p-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-medium text-text">
                  {draft.client.name}
                  {draft.client.company ? ` · ${draft.client.company}` : ""}
                  {!draft.manager && (
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      создано клиентом
                    </span>
                  )}
                </span>
                <span className="text-xs text-text-secondary">{new Date(draft.createdAt).toLocaleDateString("ru-RU")}</span>
              </div>
              <p className="mt-0.5 text-text-secondary">
                {draft.note}
                {draft.quantity != null && ` · ${draft.quantity} шт`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface QuoteWidgetProps {
  refreshKey: number;
  onOpenQuote: (quote: QuoteListItem) => void;
}

// Same pattern as SearchDraftsWidget above, one status over — a quote the
// client rejected and that needs a fresh calculation is exactly as
// actionable as an unprocessed search request, so it gets the same
// glanceable, always-collapsible treatment right next to it rather than
// staying buried in the status-pill row. Fetches independently (not from
// the pill row's allQuotes, which stays lazy until a pill is first
// clicked) so this widget's count is visible immediately on load. Rows
// are clickable — opens the quote straight into edit, same as clicking a
// quote row in Клиенты, rather than making the manager hunt for it via
// the client list. See PB-V5 chat 2026-07-29.
function NeedsReplacementWidget({ refreshKey, onOpenQuote }: QuoteWidgetProps) {
  const [items, setItems] = useState<QuoteListItem[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/manager-quotes")
      .then((res) => res.json())
      .then((d) => setItems((d.quotes ?? []).filter((q: QuoteListItem) => q.status === "needs_replacement")));
  }, [refreshKey]);

  if (!items || items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-error/30 bg-error/5 p-4 sm:p-5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-1.5 text-sm font-bold text-error">
          <AlertTriangle className="h-4 w-4" /> Нужна замена — просчётов: {items.length}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-error transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="mt-3 space-y-1.5">
          {items.map((quote) => (
            <li key={quote.id}>
              <button
                type="button"
                onClick={() => onOpenQuote(quote)}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-error/20 bg-surface p-2.5 text-left text-sm transition-colors hover:border-error/40"
              >
                <span className="font-medium text-text">
                  №{quote.displayId} · {quote.productName}
                </span>
                <span className="text-xs text-text-secondary">
                  {quote.client.name}
                  {quote.client.company ? ` · ${quote.client.company}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Same self-fetching, always-collapsible pattern as the two widgets above,
// one status earlier in the pipeline — a freshly-arrived request nobody's
// picked up yet. Primary (not warning/error) color, distinguishing "new,
// needs a first look" from "unprocessed" (amber) and "rejected, needs
// rework" (red). See PB-V5 chat 2026-07-29.
function NewRequestsWidget({ refreshKey, onOpenQuote }: QuoteWidgetProps) {
  const [items, setItems] = useState<QuoteListItem[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/manager-quotes")
      .then((res) => res.json())
      .then((d) => setItems((d.quotes ?? []).filter((q: QuoteListItem) => q.status === "new_request")));
  }, [refreshKey]);

  if (!items || items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-1.5 text-sm font-bold text-primary">
          <Inbox className="h-4 w-4" /> Новые заявки — не взяты в работу: {items.length}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-primary transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="mt-3 space-y-1.5">
          {items.map((quote) => (
            <li key={quote.id}>
              <button
                type="button"
                onClick={() => onOpenQuote(quote)}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-surface p-2.5 text-left text-sm transition-colors hover:border-primary/40"
              >
                <span className="font-medium text-text">
                  №{quote.displayId} · {quote.productName}
                </span>
                <span className="text-xs text-text-secondary">
                  {quote.client.name}
                  {quote.client.company ? ` · ${quote.client.company}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
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

  // Clicking a row in NewRequestsWidget/NeedsReplacementWidget opens this
  // quote straight into edit via the same QuoteDialog used in Клиенты,
  // instead of forcing a switch-tab-then-find-the-client detour.
  // quotesRefreshKey bumps on save so both widgets (and the pill row's own
  // list, via allQuotes below) drop the quote the moment its status
  // changes and it no longer belongs in that bucket.
  const [editingQuote, setEditingQuote] = useState<{ clientId: string; clientName: string; quoteId: string } | null>(null);
  const [quotesRefreshKey, setQuotesRefreshKey] = useState(0);

  useEffect(() => {
    fetch("/api/manager-dashboard")
      .then((res) => res.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [quotesRefreshKey]);

  // Drop the pill row's own cached quote list on save too, so it re-fetches
  // fresh data next time a pill is clicked instead of showing a quote
  // under its old status.
  useEffect(() => {
    setAllQuotes(null);
  }, [quotesRefreshKey]);

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
    return <p className="text-sm text-text-secondary">Загрузка дашборда…</p>;
  }
  if (!data) return null;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-text">Дашборд</h2>
          <div className="flex flex-wrap items-center gap-2">
            <WorldClockWidget />
            <TodayPill />
          </div>
        </div>

        <NewRequestsWidget
          refreshKey={quotesRefreshKey}
          onOpenQuote={(quote) => setEditingQuote({ clientId: quote.clientId, clientName: quote.client.name, quoteId: quote.id })}
        />
        <SearchDraftsWidget />
        <NeedsReplacementWidget
          refreshKey={quotesRefreshKey}
          onOpenQuote={(quote) => setEditingQuote({ clientId: quote.clientId, clientName: quote.client.name, quoteId: quote.id })}
        />

        <StatCardsRow
          stats={data.overall}
          expectedIncomeRub={data.expectedIncomeRub}
          actualIncomeRub={data.actualIncomeRub}
          cnyRateRub={data.cnyRateRub}
          potentialProscetRub={data.potentialProscetRub}
          potentialBuyoutRub={data.potentialBuyoutRub}
          potentialCargoProfitRub={data.potentialCargoProfitRub}
          factualProscetRub={data.factualProscetRub}
          factualBuyoutRub={data.factualBuyoutRub}
          factualDiscountRub={data.factualDiscountRub}
          factualCargoProfitRub={data.factualCargoProfitRub}
        />
        <StatusPillsRow
          stats={data.overall}
          activeFilter={activeFilter?.key ?? null}
          onSelect={handlePillSelect}
          cnyRateRub={data.cnyRateRub}
        />
        {activeFilter && <QuoteListPanel quotes={filteredQuotes} loading={loadingQuotes} cnyRateRub={data.cnyRateRub} />}

        <div className="rounded-2xl border border-border bg-bg p-4 sm:p-5">
          <div className="flex items-center gap-1.5 text-sm font-bold text-text">
            <Info className="h-4 w-4 text-text-secondary" /> Как считается премия
          </div>
          <FormattedText text={data.premiumExplanationText} />
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
              <FormattedText text={data.incomeSummaryText} />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-surface p-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Handshake className="h-3.5 w-3.5" /> Просчёт + Выкуп — потенциал
                  </div>
                  <div className="mt-1 text-lg font-bold text-text">
                    {fmtBoth(data.potentialProscetRub + data.potentialBuyoutRub, data.cnyRateRub)}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-surface p-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Handshake className="h-3.5 w-3.5" /> Просчёт + Выкуп — факт
                  </div>
                  <div className="mt-1 text-lg font-bold text-success">
                    {fmtBoth(data.factualProscetRub + data.factualBuyoutRub, data.cnyRateRub)}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-surface p-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Ship className="h-3.5 w-3.5" /> Карго — потенциал
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-lg font-bold text-text">{fmtBoth(data.potentialCargoProfitRub, data.cnyRateRub)}</span>
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
                  <div className="mt-1 text-lg font-bold text-success">{fmtBoth(data.factualCargoProfitRub, data.cnyRateRub)}</div>
                </div>
                <div className="rounded-xl border border-border bg-surface p-3.5 sm:col-span-2">
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Handshake className="h-3.5 w-3.5" /> Скидка поставщика — факт
                  </div>
                  <div className="mt-1 text-lg font-bold text-success">{fmtBoth(data.factualDiscountRub, data.cnyRateRub)}</div>
                </div>
              </div>

              {incomeExplainerOpen && (
                <div className="mt-3 rounded-xl border border-border bg-surface p-3.5">
                  <FormattedText text={data.incomeDetailText} />
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
                <div className="mt-1 text-lg font-bold text-text">{fmtBoth(data.vladShareRub, data.cnyRateRub)}</div>
              </div>
              <div className="rounded-xl border border-border bg-surface p-3.5">
                <div className="text-xs text-text-secondary">Александр (Основатель/Инвестор)</div>
                <div className="mt-1 text-lg font-bold text-text">{fmtBoth(data.founderShareRub, data.cnyRateRub)}</div>
              </div>
              <div className="rounded-xl border border-border bg-surface p-3.5">
                <div className="text-xs text-text-secondary">Антон</div>
                <div className="mt-1 text-lg font-bold text-text">{fmtBoth(data.founderShareRub, data.cnyRateRub)}</div>
              </div>
            </div>
          </div>
        )}

        {data.perManager && data.perManager.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <h3 className="text-sm font-bold text-text">KPI по сотрудникам</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-250 border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-text-secondary">
                    <th className="py-1.5 font-medium">Менеджер</th>
                    <th className="py-1.5 font-medium">Просчётов</th>
                    <th className="py-1.5 font-medium">Выкуплено</th>
                    <th className="py-1.5 font-medium">Выдано</th>
                    <th className="py-1.5 font-medium">В работе</th>
                    <th className="py-1.5 font-medium">Премия факт</th>
                    <th className="py-1.5 font-medium">Премия потенциал</th>
                    <th className="py-1.5 font-medium">Конверсия</th>
                  </tr>
                </thead>
                <tbody>
                  {data.perManager.map((row) => (
                    <tr key={row.managerId} className="border-b border-border last:border-0">
                      <td className="py-1.5 font-medium text-text">{row.managerName}</td>
                      <td className="py-1.5 text-text-secondary">{row.totalQuotes}</td>
                      <td className="py-1.5 whitespace-nowrap text-text-secondary">{fmtBoth(row.boughtRub, data.cnyRateRub)}</td>
                      <td className="py-1.5 whitespace-nowrap text-text-secondary">{fmtBoth(row.handedRub, data.cnyRateRub)}</td>
                      <td className="py-1.5 whitespace-nowrap text-text-secondary">{fmtBoth(row.pipelineRub, data.cnyRateRub)}</td>
                      <td className="py-1.5 whitespace-nowrap font-semibold text-success">{fmtBoth(row.factualPremiumRub, data.cnyRateRub)}</td>
                      <td className="py-1.5 whitespace-nowrap text-text-secondary">{fmtBoth(row.estimatedPremiumRub, data.cnyRateRub)}</td>
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

        {data.perManager && data.perManager.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <h3 className="text-sm font-bold text-text">Готовые просчёты по менеджерам</h3>
            <p className="mt-1 text-xs text-text-secondary">
              Просчёт считается готовым, как только менеджер отправил его «На согласовании» — независимо от
              дальнейшей судьбы сделки.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-100 border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-text-secondary">
                    <th className="py-1.5 font-medium">Менеджер</th>
                    <th className="py-1.5 font-medium">Сегодня</th>
                    <th className="py-1.5 font-medium">За неделю</th>
                    <th className="py-1.5 font-medium">За месяц</th>
                  </tr>
                </thead>
                <tbody>
                  {data.perManager.map((row) => (
                    <tr key={row.managerId} className="border-b border-border last:border-0">
                      <td className="py-1.5 font-medium text-text">{row.managerName}</td>
                      <td className="py-1.5 text-text-secondary">{row.completedToday}</td>
                      <td className="py-1.5 text-text-secondary">{row.completedWeek}</td>
                      <td className="py-1.5 text-text-secondary">{row.completedMonth}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {editingQuote && (
        <QuoteDialog
          client={{ id: editingQuote.clientId, name: editingQuote.clientName }}
          open={true}
          onOpenChange={(open) => !open && setEditingQuote(null)}
          onSaved={() => {
            setEditingQuote(null);
            setQuotesRefreshKey((k) => k + 1);
          }}
          editingQuoteId={editingQuote.quoteId}
        />
      )}
    </TooltipProvider>
  );
}

export { ManagerDashboard };
