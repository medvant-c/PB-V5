import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/lib/system-settings";
import { QUOTE_STATUSES, type QuoteStatus } from "@/lib/quote-statuses";
import {
  effectiveInvestorRatePercent,
  estimatedSourceProfits,
  factualSourceProfits,
  fxProfitRub,
  cargoProfitRub,
  isSelfSourcedFor,
  factualManagerPremiumRub,
  flatCargoBonusRub,
  estimatedFxProfitRub,
  distributePoolRub,
  computeQuoteShares,
  sumAlreadyPaidPremium,
  sumAlreadyPaidProfitRub,
  type CnyProfitTiers,
  type InvestorConfig,
} from "@/lib/desk-services/quote-profit";

// Statuses that imply the buyout has actually happened — client's money
// has already covered the goods, China delivery, buyout commission, and
// search-service fee, and the manager has bought the goods (moved the
// quote past "ждём оплату"). Cargo delivery to the client hasn't happened
// yet at this stage, so "выкуплено" below deliberately excludes it —
// that's what the separate "выдано клиенту" metric is for.
const BOUGHT_STATUSES: QuoteStatus[] = [
  "in_transit_to_warehouse",
  "delivered_to_warehouse",
  "sent_to_client",
  "handed_to_client",
];
// Still-open pipeline — everything except a dead end (rejected) or an
// already-completed deal (handed_to_client) — used for the "if everything
// in progress gets bought" revenue projection ("В работе").
const OPEN_STATUSES: QuoteStatus[] = QUOTE_STATUSES.filter((s) => s !== "rejected" && s !== "handed_to_client");
// Conversion is shown for information only — it used to also decide the
// premium rate, no longer does. Kept as a constant here only so the ring's
// color threshold has something to reference.
const CONVERSION_PREMIUM_THRESHOLD_PERCENT = 60;

// 2026-07-28 motivation policy, corrected 2026-07-28 (see PB-V5 chat) —
// replaces the earlier 10%/35%-of-services + 0%/10%-of-cargo scheme:
//   - Company lead: 10% each on Просчёт, Выкуп, Скидка поставщика. ZERO
//     from Карго or Фулфилмент — those two bonuses exist only for a
//     confirmed self-sourced client.
//   - Self-sourced (свой клиент): 100% on Просчёт, 50% on Выкуп, 50% on
//     Скидка — PLUS a flat $/кг or $/м³ cargo bonus (see TariffSettings.
//     managerCargoRateUsdPerKg/M3) — PLUS 10% of Фулфилмент revenue.
//   - Курсовая разница never goes to the manager, only to Влад/учредители
//     — and deliberately never mentioned anywhere in the manager-facing
//     UI (see components/manager/manager-dashboard.tsx), not just excluded
//     from the math.
// The five rates the policy above describes are no longer hardcoded here —
// owner-editable from Настройки (see SystemSettings in
// prisma/schema.prisma), fetched fresh in GET below and threaded through
// summarize() and the rest of this route.
interface PremiumRates {
  normalRatePercent: number;
  selfSourcedProscetRatePercent: number;
  selfSourcedBuyoutDiscountRatePercent: number;
}

interface QuoteForStats {
  id: string;
  managerId: string;
  status: QuoteStatus;
  createdAt: Date;
  totalRub: unknown;
  totalPriceRub: unknown;
  // ¥-denominated (not chinaDeliveryRub/totalPriceRub's ₽ conversion) —
  // needed only for estimateCnyVolume in lib/desk-services/quote-profit.ts.
  totalPriceCny: unknown;
  chinaDeliveryCny: unknown;
  chinaDeliveryRub: unknown;
  cargoDeliveryRub: unknown;
  // The real cargo cost snapshotted on the quote (Quote.cargoCostRub) —
  // NOT the same as cargoDeliveryRub, which is what the client pays and
  // already has the owner's cargo margin baked in. Using cargoDeliveryRub
  // here would count 100% of cargo revenue as a pass-through cost and
  // silently hide that margin from "profit." Reflects the actualized real
  // figure once cargo has been actualized, the original estimate before
  // that — same field, just overwritten in place by actualize-cargo.
  cargoCostRub: unknown;
  totalVolumeM3: unknown;
  totalWeightKg: unknown;
  densityKgM3: unknown;
  deliveryPricingMode: string;
  searchServiceFeeRub: unknown;
  customProductionFeeRub: unknown;
  buyoutCommissionRub: unknown;
  cnyRateUsed: unknown;
  usdRateUsed: unknown;
  // Real buyout economics — see actualize-cargo/confirm-buyout routes.
  buyoutFactConfirmed: boolean;
  actualBuyoutCny: unknown;
  actualBuyoutRateUsed: unknown;
  actualSupplierDiscountCny: unknown;
  buyoutSelfSourcedBoost: boolean | null;
  cargoBonusRatePercent: unknown;
  // Pure pass-through extra shipment costs billed to the client — excluded
  // from profit/premium in quote-profit.ts. See Quote.packagingCostRub in
  // prisma/schema.prisma.
  packagingCostRub: unknown;
  insuranceCostRub: unknown;
  mskExpensesRub: unknown;
  isCargoOnly: boolean;
  completedAt: Date | null;
  displayId: number;
  productName: string;
  client: {
    selfSourcedConfirmed: boolean;
    createdByManagerId: string | null;
    vladShareRatePercentOverride: unknown;
    name: string;
  };
  // Premium already credited via "Счёт на выкуп" partial payments (see
  // QuotePaymentAllocation in prisma/schema.prisma) — summed per-bucket by
  // sumAlreadyPaidPremium and threaded through factualManagerPremiumRub so
  // confirm-buyout's later full-quote premium never double-pays for the
  // same profit. amountRub feeds sumAlreadyPaidProfitRub the same way, for
  // the underlying ₽ profit itself (not just the premium on it) — see PB-V5
  // chat 2026-08-05.
  paymentAllocations: { category: string; premiumRub: unknown; amountRub: unknown }[];
}

function summarize(
  quotes: QuoteForStats[],
  cargoRates: { usdPerKg: number; usdPerM3: number },
  premiumRates: PremiumRates,
  cnyProfitTiers: CnyProfitTiers,
  attachedServicesByQuoteId: Map<string, number>,
) {
  const statusCounts: Record<string, number> = {};
  for (const status of QUOTE_STATUSES) statusCounts[status] = 0;
  let boughtRub = 0;
  let handedRub = 0;
  let pipelineRub = 0;
  // Gross components of pipelineRub — not owner-confidential (unlike cost/
  // margin figures), so returned to every role. Lets the "В работе" card's
  // hover breakdown show what it's actually made of instead of one opaque
  // sum. "Услуги и комиссии" isn't tracked separately here; it's the
  // residual (pipelineRub minus these three) so it always reconciles
  // exactly, same trick quoteBreakdown() in clients-tab.tsx already uses.
  let pipelineGoodsRub = 0;
  let pipelineChinaDeliveryRub = 0;
  let pipelineCargoRub = 0;
  let pipelineVolumeM3 = 0;
  let pipelineWeightKg = 0;
  let pipelineSearchFeeRub = 0;
  let pipelineBuyoutCommissionRub = 0;

  // Потенциал/факт × Просчёт/Выкуп/Скидка/Карго — see PB-V5 chat
  // 2026-07-28. Профит по источникам returned so the UI can show a real
  // breakdown instead of one opaque "services" number; premium sums are
  // derived from these using the per-source rates.
  let potentialProscetRub = 0;
  let potentialBuyoutRub = 0;
  let potentialPremiumRub = 0;
  let factualProscetRub = 0;
  let factualBuyoutRub = 0;
  let factualDiscountRub = 0;
  let factualPremiumRub = 0;
  let potentialCargoProfitRub = 0;
  let factualCargoProfitRub = 0;
  let potentialCargoBonusRub = 0;
  let factualCargoBonusRub = 0;
  // Estimated курсовая разница, pre-confirmation — see estimatedFxProfitRub
  // in lib/desk-services/quote-profit.ts. Only a projection: the factual
  // fxProfitRub() (confirmed deals) never runs through this bucket at all,
  // same as it's never shown anywhere else on this dashboard.
  let potentialFxProfitRub = 0;

  for (const q of quotes) {
    statusCounts[q.status] = (statusCounts[q.status] ?? 0) + 1;
    // "Выкуплено": everything except cargo delivery, which hasn't happened
    // yet at this stage even for a quote that's already at handed_to_client
    // (that quote also counts fully in handedRub below — the two metrics
    // overlap for handed_to_client by design, they answer different
    // questions: "money secured for the buyout" vs "fully delivered").
    if (BOUGHT_STATUSES.includes(q.status)) boughtRub += Number(q.totalRub) - Number(q.cargoDeliveryRub);
    if (q.status === "handed_to_client") handedRub += Number(q.totalRub);
    if (OPEN_STATUSES.includes(q.status)) {
      pipelineRub += Number(q.totalRub);
      // Cargo-only quotes never bill goods/China-delivery/search-fee/
      // buyout-commission (see Quote.isCargoOnly) — those fields still hold
      // record-keeping numbers, not real pipeline value, so they're
      // excluded from this gross breakdown the same way they're excluded
      // from totalRub itself. Cargo + volume/weight still count normally.
      if (!q.isCargoOnly) {
        pipelineGoodsRub += Number(q.totalPriceRub);
        pipelineChinaDeliveryRub += Number(q.chinaDeliveryRub);
        pipelineSearchFeeRub += Number(q.searchServiceFeeRub);
        pipelineBuyoutCommissionRub += Number(q.buyoutCommissionRub);
      }
      pipelineCargoRub += Number(q.cargoDeliveryRub);
      pipelineVolumeM3 += Number(q.totalVolumeM3);
      pipelineWeightKg += Number(q.totalWeightKg);
    }

    if (q.status === "rejected") continue; // dead deal — counts toward neither bucket, either side

    // Услуги — gated on buyoutFactConfirmed (a flag, independent of
    // Quote.status; see status/route.ts), not on any particular status.
    const alreadyPaidPremium = sumAlreadyPaidPremium(q.paymentAllocations);
    if (q.buyoutFactConfirmed) {
      const { proscetRub, buyoutRub, discountRub } = factualSourceProfits(q);
      factualProscetRub += proscetRub;
      factualBuyoutRub += buyoutRub;
      factualDiscountRub += discountRub;
      // Locked at confirmation time (buyoutSelfSourcedBoost), never
      // recomputed live — see schema comment on that field. Просчёт gets
      // the full 100% boost for a self-sourced client; Выкуп/Скидка get a
      // smaller 50% boost — not the same rate as Просчёт.
      // alreadyPaidPremium: whatever a "Счёт на выкуп" partial payment
      // already credited before this quote reached buyoutFactConfirmed —
      // factualManagerPremiumRub takes the max of "full formula" vs.
      // "already paid" per bucket so it's never counted twice. See PB-V5
      // chat 2026-08-04.
      factualPremiumRub += factualManagerPremiumRub(
        { proscetRub, buyoutRub, discountRub },
        Boolean(q.buyoutSelfSourcedBoost),
        premiumRates,
        alreadyPaidPremium,
      );
    } else {
      const { proscetRub, buyoutRub } = estimatedSourceProfits(q);
      // Not yet confirmed but already partially paid via "Счёт на выкуп" —
      // that slice of ₽ profit is real (search_service/custom_production/
      // buyout_commission/attached_services are 100% margin the moment the
      // money arrives, see sumAlreadyPaidProfitRub's own comment), so it
      // counts as FACTUAL profit right now instead of waiting for
      // confirm-buyout, mirroring how alreadyPaidPremium already works for
      // premium just below. See PB-V5 chat 2026-08-05.
      const alreadyPaidProfit = sumAlreadyPaidProfitRub(q.paymentAllocations);
      factualProscetRub += alreadyPaidProfit.proscetRub;
      factualBuyoutRub += alreadyPaidProfit.buyoutRub;
      potentialProscetRub += Math.max(0, proscetRub - alreadyPaidProfit.proscetRub);
      potentialBuyoutRub += Math.max(0, buyoutRub - alreadyPaidProfit.buyoutRub);
      potentialFxProfitRub += estimatedFxProfitRub(q, attachedServicesByQuoteId.get(q.id) ?? 0, cnyProfitTiers);
      const isBoosted = isSelfSourcedFor(q.client, q.managerId);
      const proscetRate = isBoosted ? premiumRates.selfSourcedProscetRatePercent : premiumRates.normalRatePercent;
      const buyoutRate = isBoosted ? premiumRates.selfSourcedBuyoutDiscountRatePercent : premiumRates.normalRatePercent;
      const fullProscetPotentialRub = Math.max(0, proscetRub) * (proscetRate / 100);
      const fullBuyoutPotentialRub = Math.max(0, buyoutRub) * (buyoutRate / 100);
      // Not yet confirmed but already partially paid — that slice is real,
      // credited premium, so it counts as FACTUAL here even though the
      // quote overall is still "potential", and is subtracted out of the
      // potential bucket so the two never overlap.
      factualPremiumRub += alreadyPaidPremium.proscetRub + alreadyPaidPremium.buyoutRub;
      potentialPremiumRub +=
        Math.max(0, fullProscetPotentialRub - alreadyPaidPremium.proscetRub) +
        Math.max(0, fullBuyoutPotentialRub - alreadyPaidPremium.buyoutRub);
    }

    // Карго — gated on cargoBonusRatePercent being locked in, which only
    // happens at the handed_to_client transition (see status/route.ts).
    // The stored value distinguishes self-sourced (10) from company-lead
    // (0) — only self-sourced gets the flat-rate bonus, company-lead gets
    // nothing (cargoProfitRub itself is still tracked either way, for the
    // owner's own accounting).
    if (q.cargoBonusRatePercent !== null && q.cargoBonusRatePercent !== undefined) {
      factualCargoProfitRub += cargoProfitRub(q);
      factualCargoBonusRub += Number(q.cargoBonusRatePercent) > 0 ? flatCargoBonusRub(q, cargoRates) : 0;
    } else {
      potentialCargoProfitRub += cargoProfitRub(q);
      potentialCargoBonusRub += isSelfSourcedFor(q.client, q.managerId) ? flatCargoBonusRub(q, cargoRates) : 0;
    }
  }

  // All-time, not just the open pipeline above — this is every quote this
  // manager (or scope) has ever made. Purely informational — no longer
  // wired to the premium rate itself.
  const nonRejected = quotes.filter((q) => q.status !== "rejected").length;
  const convertedCount = quotes.filter((q) => BOUGHT_STATUSES.includes(q.status)).length;
  const conversionPercent = nonRejected > 0 ? Math.round((convertedCount / nonRejected) * 100) : 0;

  const estimatedPremiumRub = potentialPremiumRub + potentialCargoBonusRub;
  const totalFactualPremiumRub = factualPremiumRub + factualCargoBonusRub;

  return {
    statusCounts,
    totalQuotes: quotes.length,
    boughtRub,
    handedRub,
    pipelineRub,
    pipelineGoodsRub,
    pipelineChinaDeliveryRub,
    pipelineCargoRub,
    pipelineVolumeM3,
    pipelineWeightKg,
    pipelineSearchFeeRub,
    pipelineBuyoutCommissionRub,
    potentialProscetRub,
    potentialBuyoutRub,
    factualProscetRub,
    factualBuyoutRub,
    factualDiscountRub,
    potentialCargoProfitRub,
    factualCargoProfitRub,
    potentialCargoBonusRub,
    factualCargoBonusRub,
    potentialFxProfitRub,
    estimatedPremiumRub,
    factualPremiumRub: totalFactualPremiumRub,
    conversionPercent,
  };
}

export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const [tariffSettings, systemSettings] = await Promise.all([
    prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } }),
    getSystemSettings(session.managerId),
  ]);
  const cargoRates = {
    usdPerKg: tariffSettings ? Number(tariffSettings.managerCargoRateUsdPerKg) : 0.3,
    usdPerM3: tariffSettings ? Number(tariffSettings.managerCargoRateUsdPerM3) : 5,
  };
  const premiumRates: PremiumRates = {
    normalRatePercent: Number(systemSettings.normalRatePercent),
    selfSourcedProscetRatePercent: Number(systemSettings.selfSourcedProscetRatePercent),
    selfSourcedBuyoutDiscountRatePercent: Number(systemSettings.selfSourcedBuyoutDiscountRatePercent),
  };
  const fulfillmentPremiumRatePercent = Number(systemSettings.fulfillmentPremiumRatePercent);
  const cnyProfitTiers: CnyProfitTiers = {
    base: tariffSettings?.cnyProfitPerYuanRub !== undefined && tariffSettings?.cnyProfitPerYuanRub !== null ? Number(tariffSettings.cnyProfitPerYuanRub) : 0,
    tier3000: tariffSettings?.cnyProfitPerYuanRubTier3000 !== undefined && tariffSettings?.cnyProfitPerYuanRubTier3000 !== null ? Number(tariffSettings.cnyProfitPerYuanRubTier3000) : null,
    tier10000: tariffSettings?.cnyProfitPerYuanRubTier10000 !== undefined && tariffSettings?.cnyProfitPerYuanRubTier10000 !== null ? Number(tariffSettings.cnyProfitPerYuanRubTier10000) : null,
    tier30000: tariffSettings?.cnyProfitPerYuanRubTier30000 !== undefined && tariffSettings?.cnyProfitPerYuanRubTier30000 !== null ? Number(tariffSettings.cnyProfitPerYuanRubTier30000) : null,
  };

  const visibleManagerIds = await getVisibleManagerIds(session);
  const quotes = await prisma.quote.findMany({
    where: { deletedAt: null, ...(visibleManagerIds === "all" ? {} : { managerId: { in: visibleManagerIds } }) },
    select: {
      id: true,
      managerId: true,
      status: true,
      createdAt: true,
      totalRub: true,
      totalPriceRub: true,
      totalPriceCny: true,
      chinaDeliveryCny: true,
      chinaDeliveryRub: true,
      cargoDeliveryRub: true,
      cargoCostRub: true,
      totalVolumeM3: true,
      totalWeightKg: true,
      densityKgM3: true,
      deliveryPricingMode: true,
      searchServiceFeeRub: true,
      customProductionFeeRub: true,
      buyoutCommissionRub: true,
      cnyRateUsed: true,
      usdRateUsed: true,
      buyoutFactConfirmed: true,
      actualBuyoutCny: true,
      actualBuyoutRateUsed: true,
      actualSupplierDiscountCny: true,
      buyoutSelfSourcedBoost: true,
      cargoBonusRatePercent: true,
      packagingCostRub: true,
      insuranceCostRub: true,
      mskExpensesRub: true,
      isCargoOnly: true,
      completedAt: true,
      displayId: true,
      productName: true,
      client: { select: { selfSourcedConfirmed: true, createdByManagerId: true, vladShareRatePercentOverride: true, name: true } },
      paymentAllocations: { select: { category: true, premiumRub: true, amountRub: true } },
    },
  });

  // Needed only for estimateCnyVolume (see lib/desk-services/quote-profit.ts)
  // — one batched sum per quote instead of a query per quote.
  const attachedServiceSums = await prisma.quoteAttachedService.groupBy({
    by: ["quoteId"],
    where: { quoteId: { in: quotes.map((q) => q.id) } },
    _sum: { priceRub: true },
  });
  const attachedServicesByQuoteId = new Map(attachedServiceSums.map((s) => [s.quoteId, Number(s._sum.priceRub ?? 0)]));

  // "Готовые просчёты" — how many quotes each manager marked complete
  // (first reached pending_approval) today/this week/this month, per PB-V5
  // chat 2026-07-28. Monday-indexed week, calendar month — completedAt is
  // permanent (see status/route.ts), so this reflects real completed work
  // regardless of what happened to the deal afterward.
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mondayIndexedDay = (now.getDay() + 6) % 7;
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - mondayIndexedDay);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  function countCompletedSince(managerId: string, since: Date): number {
    return quotes.filter((q) => q.managerId === managerId && q.completedAt && new Date(q.completedAt) >= since).length;
  }

  // Same filter as countCompletedSince, just returning what the count is
  // actually counting — powers the "какие именно просчёты" hover tooltip
  // on "Готовые просчёты по менеджерам" instead of leaving the owner to
  // guess from a bare number. See PB-V5 chat 2026-08-01.
  function completedQuotesSince(managerId: string, since: Date): { id: string; displayId: number; productName: string; clientName: string }[] {
    return quotes
      .filter((q) => q.managerId === managerId && q.completedAt && new Date(q.completedAt) >= since)
      .map((q) => ({ id: q.id, displayId: q.displayId, productName: q.productName, clientName: q.client.name }));
  }

  // Фулфилмент — a separate business line from Quote entirely (see PB-V5
  // chat 2026-07-28), recognized immediately (no potential/factual split —
  // it's a completed transaction the moment the order is saved, not a
  // pending estimate). Manager gets a flat 10% of what was billed, but
  // ONLY for a confirmed self-sourced client — a company lead earns the
  // manager nothing here (corrected 2026-07-28). The full revenue still
  // counts toward the Влад/founders pool below either way.
  const fulfillmentOrders = await prisma.fulfillmentOrder.findMany({
    where: visibleManagerIds === "all" ? undefined : { managerId: { in: visibleManagerIds } },
    select: {
      managerId: true,
      totalRub: true,
      client: { select: { selfSourcedConfirmed: true, createdByManagerId: true, vladShareRatePercentOverride: true } },
    },
  });
  const fulfillmentPremiumRubByManager = new Map<string, number>();
  for (const o of fulfillmentOrders) {
    const rub = Number(o.totalRub);
    const isSelfSourced = o.client.selfSourcedConfirmed && o.client.createdByManagerId === o.managerId;
    if (!isSelfSourced) continue;
    const premium = rub * (fulfillmentPremiumRatePercent / 100);
    fulfillmentPremiumRubByManager.set(o.managerId, (fulfillmentPremiumRubByManager.get(o.managerId) ?? 0) + premium);
  }
  function withFulfillmentPremium<T extends { factualPremiumRub: number }>(row: T, managerId: string | "all"): T & { factualFulfillmentPremiumRub: number } {
    const premium =
      managerId === "all"
        ? [...fulfillmentPremiumRubByManager.values()].reduce((sum, v) => sum + v, 0)
        : (fulfillmentPremiumRubByManager.get(managerId) ?? 0);
    return { ...row, factualFulfillmentPremiumRub: premium, factualPremiumRub: row.factualPremiumRub + premium };
  }

  const overall = withFulfillmentPremium(
    summarize(quotes, cargoRates, premiumRates, cnyProfitTiers, attachedServicesByQuoteId),
    "all",
  );

  // Опциональный период (День/Неделя/Месяц/свой) — фильтрует ВЕСЬ дашборд
  // (карточки «В работе»/«Конверсия»/«Премия»/«Доход компании») по дате
  // СОЗДАНИЯ просчёта, не по дате оплаты/факта (то другое — см.
  // lib/desk-services/period-report.ts, "Реальные деньги за период" в
  // Отчёте о прибыли, которая датирует по реальным денежным событиям).
  // Это здесь — просто "как выглядела бы эта же карточка, если бы мы
  // считали её только по сделкам этого периода", тот же summarize(), на
  // подмножестве quotes. См. PB-V5 chat 2026-08-06.
  // Fulfillment premium is deliberately NOT folded in here (unlike
  // `overall` above) — fulfillment orders aren't quotes and have no
  // creation-date link to this period filter, so mixing an all-time
  // fulfillment figure into an otherwise period-scoped card would be
  // misleading rather than helpful.
  let periodOverall: ReturnType<typeof summarize> | null = null;
  let periodExpectedIncomeRub: number | null = null;
  let periodActualIncomeRub: number | null = null;
  const dashboardFromParam = req.nextUrl.searchParams.get("from");
  const dashboardToParam = req.nextUrl.searchParams.get("to");
  if (dashboardFromParam && dashboardToParam) {
    const dashboardFrom = new Date(dashboardFromParam);
    const dashboardTo = new Date(dashboardToParam);
    if (!Number.isNaN(dashboardFrom.getTime()) && !Number.isNaN(dashboardTo.getTime())) {
      const periodQuotes = quotes.filter((q) => q.createdAt >= dashboardFrom && q.createdAt < dashboardTo);
      periodOverall = summarize(periodQuotes, cargoRates, premiumRates, cnyProfitTiers, attachedServicesByQuoteId);
      if (session.role === "owner") {
        periodExpectedIncomeRub =
          periodOverall.potentialProscetRub + periodOverall.potentialBuyoutRub + periodOverall.potentialCargoProfitRub + periodOverall.potentialFxProfitRub - periodOverall.estimatedPremiumRub;
        periodActualIncomeRub =
          periodOverall.factualProscetRub + periodOverall.factualBuyoutRub + periodOverall.factualDiscountRub + periodOverall.factualCargoProfitRub - periodOverall.factualPremiumRub;
      }
    }
  }

  // Per-manager breakdown — meaningful for owner (sees everyone) and senior
  // (sees their team); a plain manager only ever sees themself here, so
  // it's omitted for them (the overall numbers above already are theirs).
  let perManager: (ReturnType<typeof withFulfillmentPremium<ReturnType<typeof summarize>>> & { managerId: string; managerName: string })[] | null =
    null;
  if (session.role === "owner" || session.role === "senior") {
    // Every manager in scope, including ones with zero quotes so far —
    // that's exactly what a "who isn't pulling their weight" view needs to
    // show, not just whoever happens to have a quote already.
    const managers = await prisma.manager.findMany({
      where: visibleManagerIds === "all" ? { role: { not: "owner" } } : { id: { in: visibleManagerIds } },
      select: { id: true, name: true },
    });
    const byManager = new Map<string, QuoteForStats[]>();
    for (const q of quotes) {
      const list = byManager.get(q.managerId) ?? [];
      list.push(q);
      byManager.set(q.managerId, list);
    }
    perManager = managers.map((m) => ({
      managerId: m.id,
      managerName: m.name,
      ...withFulfillmentPremium(
        summarize(byManager.get(m.id) ?? [], cargoRates, premiumRates, cnyProfitTiers, attachedServicesByQuoteId),
        m.id,
      ),
      completedToday: countCompletedSince(m.id, startOfDay),
      completedWeek: countCompletedSince(m.id, startOfWeek),
      completedMonth: countCompletedSince(m.id, startOfMonth),
      completedTodayList: completedQuotesSince(m.id, startOfDay),
      completedWeekList: completedQuotesSince(m.id, startOfWeek),
      completedMonthList: completedQuotesSince(m.id, startOfMonth),
    }));
  }

  // Company-wide income, owner-only. Potential = if every open quote gets
  // bought/actualized/handed over as currently estimated, minus every
  // manager's own potential premium (summed per-manager, not "10% of the
  // company-wide total", so a manager who's currently net-negative doesn't
  // drag down what gets deducted for managers who are profitable).
  // Factual = the same, but only counting what's actually been confirmed —
  // no longer a projection.
  let expectedIncomeRub: number | null = null;
  let actualIncomeRub: number | null = null;
  // Owner-only: the profit-by-source buckets, plus the physical cargo
  // totals and the two always-certain services-revenue lines (both already
  // shown per-quote to any manager, so not confidential on their own —
  // only the company-wide aggregate view is owner-gated).
  let potentialProscetRub: number | null = null;
  let potentialBuyoutRub: number | null = null;
  let factualProscetRub: number | null = null;
  let factualBuyoutRub: number | null = null;
  let factualDiscountRub: number | null = null;
  let potentialCargoProfitRub: number | null = null;
  let factualCargoProfitRub: number | null = null;
  let cargoVolumeM3: number | null = null;
  let cargoWeightKg: number | null = null;
  let searchFeeRub: number | null = null;
  let buyoutCommissionRub: number | null = null;
  // Every active investor's cut (see Investor model) — company-wide, not
  // per-manager; negative per-quote totals are clamped to 0 first, same
  // convention as manager premiums, so one loss-making deal never eats
  // into shares already earned elsewhere. Replaces the old fixed
  // Влад/Юра/Александр/Антон fields — see PB-V5 chat 2026-07-31.
  let investorShares: { id: string; name: string; shareType: string; shareRub: number }[] | null = null;
  if (session.role === "owner" && perManager) {
    // From `overall` (every quote/order in scope), not `perManager` (which
    // excludes the owner — see its `role: { not: "owner" }` filter above,
    // meant only for the "who isn't pulling their weight" leaderboard). The
    // premium belongs to whoever a deal is actually assigned to, regardless
    // of role — a quote the owner personally handles still owes exactly the
    // same premium as any other manager's, and must still be subtracted
    // before splitting what's left among investors. See PB-V5 chat
    // 2026-08-01.
    const totalManagerPotentialPremiumsRub = overall.estimatedPremiumRub;
    const totalManagerFactualPremiumsRub = overall.factualPremiumRub;
    expectedIncomeRub =
      overall.potentialProscetRub +
      overall.potentialBuyoutRub +
      overall.potentialCargoProfitRub +
      overall.potentialFxProfitRub -
      totalManagerPotentialPremiumsRub;
    actualIncomeRub =
      overall.factualProscetRub +
      overall.factualBuyoutRub +
      overall.factualDiscountRub +
      overall.factualCargoProfitRub -
      totalManagerFactualPremiumsRub;
    potentialProscetRub = overall.potentialProscetRub;
    potentialBuyoutRub = overall.potentialBuyoutRub;
    factualProscetRub = overall.factualProscetRub;
    factualBuyoutRub = overall.factualBuyoutRub;
    factualDiscountRub = overall.factualDiscountRub;
    potentialCargoProfitRub = overall.potentialCargoProfitRub;
    factualCargoProfitRub = overall.factualCargoProfitRub;
    cargoVolumeM3 = overall.pipelineVolumeM3;
    cargoWeightKg = overall.pipelineWeightKg;
    searchFeeRub = overall.pipelineSearchFeeRub;
    buyoutCommissionRub = overall.pipelineBuyoutCommissionRub;

    const investorRows = await prisma.investor.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
    const investors: InvestorConfig[] = investorRows.map((inv) => ({
      id: inv.id,
      name: inv.name,
      shareType: inv.shareType as InvestorConfig["shareType"],
      ratePercent: inv.ratePercent !== null ? Number(inv.ratePercent) : null,
      rateUsdPerKg: inv.rateUsdPerKg !== null ? Number(inv.rateUsdPerKg) : null,
    }));
    const remainderInvestorIds = investors.filter((inv) => inv.shareType === "remainder_share").map((inv) => inv.id);
    const investorSharesById = new Map<string, number>();
    const addInvestorShare = (id: string, amountRub: number) => investorSharesById.set(id, (investorSharesById.get(id) ?? 0) + amountRub);

    // Every confirmed quote's cut — percent_of_profit, flat_per_cargo_kg,
    // AND remainder_share alike — computed PER DEAL by computeQuoteShares
    // (see quote-profit.ts), not once on an aggregate pool: that's the only
    // way a per-client override (Client.vladShareRatePercentOverride) can
    // actually change anything, and the only way a deal's cargo margin can
    // correctly wait for delivery (cargoBonusRatePercent locked in) while
    // its services profit still distributes now. See PB-V5 chat 2026-08-01,
    // 2026-08-06.
    for (const q of quotes.filter((quote) => quote.buyoutFactConfirmed)) {
      const sourceProfits = factualSourceProfits(q);
      const fx = fxProfitRub(q);
      const cargo = cargoProfitRub(q);
      const managerServicesPremiumRub = factualManagerPremiumRub(
        sourceProfits,
        Boolean(q.buyoutSelfSourcedBoost),
        premiumRates,
        sumAlreadyPaidPremium(q.paymentAllocations),
      );
      // cargoBonusRatePercent is set (to 0 OR a real rate) the moment cargo
      // hands off to the client — the VALUE only decides whether the
      // manager personally gets a self-sourced bonus, not whether cargo
      // counts as realized for Юра/Влад/remainder_share investors.
      const cargoRealized = q.cargoBonusRatePercent !== null;
      const managerCargoBonusRub =
        cargoRealized && Number(q.cargoBonusRatePercent) > 0 && isSelfSourcedFor(q.client, q.managerId) ? flatCargoBonusRub(q, cargoRates) : 0;
      const { investorSharesById: perQuoteShares } = computeQuoteShares(
        sourceProfits.proscetRub + sourceProfits.buyoutRub + sourceProfits.discountRub + fx,
        managerServicesPremiumRub,
        cargoRealized,
        cargo,
        managerCargoBonusRub,
        q,
        investors,
        q.client,
      );
      for (const [id, amountRub] of perQuoteShares) addInvestorShare(id, amountRub);
    }

    // Фулфилмент — a separate profit source with no cargo concept of its
    // own, so it uses distributePoolRub directly rather than the full
    // computeQuoteShares wrapper: one flat-% cut per percent_of_profit
    // investor (off the order's own totalRub, never chained through the
    // manager's self-sourced premium), then whatever's left folds into the
    // SAME remainder_share investors quotes above already contribute to —
    // summing each item's own remainder split is mathematically the same as
    // splitting one combined aggregate pool once, just computed per item.
    for (const o of fulfillmentOrders) {
      const isSelfSourced = o.client.selfSourcedConfirmed && o.client.createdByManagerId === o.managerId;
      const fulfillmentPremiumRub = isSelfSourced ? Number(o.totalRub) * (fulfillmentPremiumRatePercent / 100) : 0;
      const percentInvestors = investors
        .filter((inv) => inv.shareType === "percent_of_profit")
        .map((inv) => ({ id: inv.id, ratePercent: effectiveInvestorRatePercent(o.client, Number(inv.ratePercent ?? 0)) }));
      const { percentSharesById, remainderById } = distributePoolRub(
        Number(o.totalRub),
        0,
        fulfillmentPremiumRub,
        percentInvestors,
        remainderInvestorIds,
      );
      for (const [id, amountRub] of percentSharesById) addInvestorShare(id, amountRub);
      for (const [id, amountRub] of remainderById) addInvestorShare(id, amountRub);
    }

    investorShares = investors.map((inv) => ({
      id: inv.id,
      name: inv.name,
      shareType: inv.shareType,
      shareRub: investorSharesById.get(inv.id) ?? 0,
    }));
  }

  // Owner-confidential cargo-margin signal — never leaves the server for
  // anyone but the owner, same as it's always been.
  const stripCargoProfit = <T extends { potentialCargoProfitRub: number; factualCargoProfitRub: number }>(
    row: T,
  ): Omit<T, "potentialCargoProfitRub" | "factualCargoProfitRub"> => {
    const copy = { ...row };
    delete (copy as Partial<T>).potentialCargoProfitRub;
    delete (copy as Partial<T>).factualCargoProfitRub;
    return copy;
  };
  const responseOverall = session.role === "owner" ? overall : stripCargoProfit(overall);
  const responsePerManager = perManager && session.role !== "owner" ? perManager.map(stripCargoProfit) : perManager;

  const responsePeriodOverall = periodOverall && session.role !== "owner" ? stripCargoProfit(periodOverall) : periodOverall;

  return Response.json({
    overall: responseOverall,
    perManager: responsePerManager,
    periodOverall: responsePeriodOverall,
    periodExpectedIncomeRub,
    periodActualIncomeRub,
    expectedIncomeRub,
    actualIncomeRub,
    potentialProscetRub,
    potentialBuyoutRub,
    factualProscetRub,
    factualBuyoutRub,
    factualDiscountRub,
    potentialCargoProfitRub,
    factualCargoProfitRub,
    cargoVolumeM3,
    cargoWeightKg,
    searchFeeRub,
    buyoutCommissionRub,
    investorShares,
    // Every ₽ figure on the dashboard is DISPLAYED in ¥ (per PB-V5 chat
    // 2026-07-28) — the frontend converts using this rate rather than the
    // backend recomputing everything in CNY, so the underlying premium/
    // profit math stays exactly as-is, just rendered in a different unit.
    cnyRateRub: tariffSettings ? Number(tariffSettings.cnyRateRub) : 1,
    conversionPremiumThresholdPercent: CONVERSION_PREMIUM_THRESHOLD_PERCENT,
    // Owner-editable from Настройки — see FormattedText in
    // manager-dashboard.tsx for the "**bold**" rendering.
    premiumExplanationText: systemSettings.premiumExplanationText,
    incomeSummaryText: systemSettings.incomeSummaryText,
    incomeDetailText: systemSettings.incomeDetailText,
  });
}
