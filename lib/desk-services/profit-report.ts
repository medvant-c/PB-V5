import "server-only";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/lib/system-settings";
import {
  computeQuoteShares,
  estimatedFxProfitRub,
  estimatedSourceProfits,
  factualManagerPremiumRub,
  factualSourceProfits,
  flatCargoBonusRub,
  fxProfitRub,
  isSelfSourcedFor,
  sumAlreadyPaidPremium,
  computeRealBuyoutProfit,
  computePlannedBuyoutProfit,
  type CnyProfitTiers,
  type InvestorConfig,
  type QuoteProfitFields,
} from "@/lib/desk-services/quote-profit";
import { fetchQuoteRealFinancials, emptyQuoteRealFinancials, type QuoteRealFinancials } from "@/lib/desk-services/quote-real-financials";
import { BUYOUT_REALIZED_STATUSES, CARGO_REALIZED_STATUSES } from "@/lib/quote-statuses";

// Shared by both app/api/manager-profit-report/route.ts (on-screen JSON) and
// app/api/manager-profit-report/pdf/route.ts (downloaded PDF) — kept out of
// either route.ts file since Next's App Router only allows recognized
// exports (GET/POST/etc.) from a route file, not arbitrary helpers.

// The full QuoteProfitFields shape plus everything flatCargoBonusRub and the
// manager-premium math need — same field set app/api/manager-dashboard/
// route.ts already fetches for its QuoteForStats.
const PROFIT_SELECT = {
  id: true,
  displayId: true,
  productName: true,
  status: true,
  createdAt: true,
  managerId: true,
  totalRub: true,
  totalPriceRub: true,
  // ¥-denominated — needed only for estimateCnyVolume (see
  // lib/desk-services/quote-profit.ts), distinct from the ₽ figures above.
  totalPriceCny: true,
  chinaDeliveryCny: true,
  chinaDeliveryRub: true,
  cargoDeliveryRub: true,
  cargoCostRub: true,
  cargoCostUsd: true,
  cargoRateUsd: true,
  searchServiceFeeRub: true,
  customProductionFeeRub: true,
  buyoutCommissionRub: true,
  buyoutCommissionPercent: true,
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
  totalWeightKg: true,
  totalVolumeM3: true,
  densityKgM3: true,
  deliveryPricingMode: true,
  manager: { select: { id: true, name: true } },
  client: {
    select: {
      id: true,
      name: true,
      company: true,
      selfSourcedConfirmed: true,
      createdByManagerId: true,
      vladShareRatePercentOverride: true,
    },
  },
  // See sumAlreadyPaidPremium in quote-profit.ts — premium already
  // credited via "Счёт на выкуп" partial payments, subtracted here so this
  // report never double-counts it once the quote reaches
  // buyoutFactConfirmed. See PB-V5 chat 2026-08-04. amountRub — нужен ещё
  // computeRealBuyoutProfit/sumAlreadyPaidProfitRub (реальные деньги вместо
  // ручного подтверждения, см. PB-V5 chat 2026-08-11).
  paymentAllocations: { select: { category: true, premiumRub: true, amountRub: true } },
} as const;

type ProfitQuote = NonNullable<Awaited<ReturnType<typeof fetchProfitQuotes>>>[number];

function fetchProfitQuotes(quoteIds: string[]) {
  return prisma.quote.findMany({ where: { id: { in: quoteIds }, deletedAt: null }, select: PROFIT_SELECT });
}

interface PremiumRates {
  normalRatePercent: number;
  selfSourcedProscetRatePercent: number;
  selfSourcedBuyoutDiscountRatePercent: number;
}

// One quote's full breakdown — приход/расход/прибыль по двум блокам
// (Выкуп/Карго), никакой детализации по источникам (просчёт/скидка/
// курсовая) — по прямому указанию пользователя убрать её из отчёта, см.
// PB-V5 chat 2026-08-11. Плюс этой сделки в долю каждого percent_of_
// profit/flat_per_cargo_kg инвестора и в премию менеджера, чтобы
// построчные данные и батч-итоги ниже всегда сходились. remainder_share
// инвесторы здесь не считаются — этот сплит имеет смысл только на
// агрегированном остатке (см. buildProfitReport ниже), не построчно.
function computeQuoteBreakdown(
  q: ProfitQuote,
  cargoRates: { usdPerKg: number; usdPerM3: number },
  premiumRates: PremiumRates,
  investors: InvestorConfig[],
  cnyProfitTiers: CnyProfitTiers,
  attachedServicesTotalRub: number,
  financials: QuoteRealFinancials,
) {
  const fields: QuoteProfitFields = q;
  const alreadyPaidPremium = sumAlreadyPaidPremium(q.paymentAllocations);
  const isBoosted = isSelfSourcedFor(q.client, q.managerId);
  const proscetRate = isBoosted ? premiumRates.selfSourcedProscetRatePercent : premiumRates.normalRatePercent;
  const buyoutRate = isBoosted ? premiumRates.selfSourcedBuyoutDiscountRatePercent : premiumRates.normalRatePercent;

  // --- Блок "Выкуп" ---
  // Уже подтверждённые по старой схеме (buyoutFactConfirmed: true) —
  // прежняя формула без изменений (задним числом не пересчитываем, см.
  // план mellow-forging-kay.md), просто выражена в приход/расход форме:
  // расход = реально потраченное (actualBuyoutCny×actualBuyoutRateUsed),
  // приход = расход + прежняя формула прибыли (проскет+выкуп+скидка+fx).
  //
  // Иначе — статус решает "факт или план" (BUYOUT_REALIZED_STATUSES, не
  // полнота оплаты — как только менеджер перевёл сделку в "в доставке на
  // склад", товар уже реально куплен, даже если оплата от клиента ещё не
  // вся собрана, например аванс под производство под заказ). Факт: приход
  // = вся сумма реально поступивших QuotePaymentAllocation (любая
  // категория — просчёт больше не выделяется отдельной строкой), расход =
  // реальные расходные CashOrder ("Закупка товара"+"Доставка по Китаю").
  // План: приход = по ставкам просчёта, расход = по ставкам просчёта минус
  // известная типовая наценка за ¥ (estimatedFxProfitRub из Тарифов).
  const buyoutBought = BUYOUT_REALIZED_STATUSES.includes(q.status);
  let buyoutIncomeRub: number;
  let buyoutExpenseRub: number;
  let managerServicesPremiumRub: number;
  if (q.buyoutFactConfirmed) {
    const sourceProfits = factualSourceProfits(fields);
    const fx = fxProfitRub(fields);
    const profitRub = sourceProfits.proscetRub + sourceProfits.buyoutRub + sourceProfits.discountRub + fx;
    buyoutExpenseRub = Number(q.actualBuyoutCny) * Number(q.actualBuyoutRateUsed);
    buyoutIncomeRub = profitRub + buyoutExpenseRub;
    managerServicesPremiumRub = factualManagerPremiumRub(sourceProfits, Boolean(q.buyoutSelfSourcedBoost), premiumRates, alreadyPaidPremium);
  } else if (buyoutBought) {
    buyoutIncomeRub = q.paymentAllocations.reduce((sum, a) => sum + Number(a.amountRub), 0);
    buyoutExpenseRub = financials.buyoutExpenseRub;
    const real = computeRealBuyoutProfit({ allocations: q.paymentAllocations, expenseRub: financials.buyoutExpenseRub });
    // Не ниже alreadyPaidPremium.buyoutRub — иначе премия менеджера могла
    // бы уменьшиться при переходе план→факт (см. PB-V5 chat 2026-08-12).
    managerServicesPremiumRub =
      alreadyPaidPremium.proscetRub + Math.max(alreadyPaidPremium.buyoutRub, Math.max(0, real.profitRub) * (buyoutRate / 100));
  } else {
    const estimated = estimatedSourceProfits(fields);
    const fx = estimatedFxProfitRub(q, attachedServicesTotalRub, cnyProfitTiers);
    const planned = computePlannedBuyoutProfit(q, attachedServicesTotalRub, fx);
    buyoutIncomeRub = planned.incomeRub + estimated.proscetRub;
    buyoutExpenseRub = planned.expenseRub;
    const fullProscetPotentialRub = Math.max(0, estimated.proscetRub) * (proscetRate / 100);
    const fullBuyoutPotentialRub = Math.max(0, estimated.buyoutRub) * (buyoutRate / 100);
    managerServicesPremiumRub =
      alreadyPaidPremium.proscetRub +
      alreadyPaidPremium.buyoutRub +
      Math.max(0, fullProscetPotentialRub - alreadyPaidPremium.proscetRub) +
      Math.max(0, fullBuyoutPotentialRub - alreadyPaidPremium.buyoutRub);
  }
  const buyoutProfitRub = buyoutIncomeRub - buyoutExpenseRub;

  // --- Блок "Карго" ---
  // cargoBonusRatePercent уже зафиксирован (сделка дошла до "выдано
  // клиенту" по старой схеме) ИЛИ статус ещё не дошёл до "отправлен
  // клиенту" — план по ставкам просчёта (cargoDeliveryRub/cargoCostRub,
  // тот же приход/расход, что cargoProfitRub всегда неявно считал).
  // Иначе — факт из Кассы. См. PB-V5 chat 2026-08-11.
  const cargoLocked = q.cargoBonusRatePercent !== null && q.cargoBonusRatePercent !== undefined;
  const cargoSent = CARGO_REALIZED_STATUSES.includes(q.status);
  let cargoIncomeRub: number;
  let cargoExpenseRub: number;
  if (cargoLocked || !cargoSent) {
    cargoIncomeRub = Number(q.cargoDeliveryRub);
    cargoExpenseRub = Number(q.cargoCostRub);
  } else {
    cargoIncomeRub = financials.cargoIncomeRub;
    cargoExpenseRub = financials.cargoExpenseRub;
  }
  const cargoProfitRubValue = cargoIncomeRub - cargoExpenseRub;
  // Доля МЕНЕДЖЕРА (managerCargoBonusRub) по-прежнему решается только
  // cargoBonusRatePercent ("выдано клиенту") — отдельный вопрос, не
  // трогаем; распределение долей инвесторов (cargoRealized) — статусом
  // "отправлен клиенту" наравне со всем остальным. См. PB-V5 chat
  // 2026-08-11.
  const cargoRealized = cargoLocked || cargoSent;
  const managerCargoBonusRub = cargoLocked ? flatCargoBonusRub(q, cargoRates, Number(q.cargoBonusRatePercent)) : 0;

  const { managerPremiumRub, investorSharesById } = computeQuoteShares(
    buyoutProfitRub,
    managerServicesPremiumRub,
    cargoRealized,
    cargoProfitRubValue,
    managerCargoBonusRub,
    q,
    investors,
    q.client,
  );
  // remainder_share is now included here too — computeQuoteShares splits it
  // PER QUOTE (per pool, actually — services and cargo each get their own
  // split, summed), not once on an aggregate pool the way buildProfitReport
  // used to. See PB-V5 chat 2026-08-06.
  const investorShares = investors.map((inv) => ({
    id: inv.id,
    name: inv.name,
    shareType: inv.shareType,
    shareRub: investorSharesById.get(inv.id) ?? 0,
  }));

  return {
    id: q.id,
    displayId: q.displayId,
    productName: q.productName,
    status: q.status,
    createdAt: q.createdAt,
    manager: q.manager,
    client: q.client,
    totalRub: Number(q.totalRub),
    buyout: { incomeRub: buyoutIncomeRub, expenseRub: buyoutExpenseRub, profitRub: buyoutProfitRub, realized: q.buyoutFactConfirmed || buyoutBought },
    cargo: { incomeRub: cargoIncomeRub, expenseRub: cargoExpenseRub, profitRub: cargoProfitRubValue, realized: cargoRealized },
    totalProfitRub: buyoutProfitRub + cargoProfitRubValue,
    investorShares,
    managerPremiumRub,
  };
}

async function loadRatesAndQuotes(quoteIds: string[]) {
  const [tariffSettings, systemSettings, quotes, investorRows] = await Promise.all([
    prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } }),
    getSystemSettings(),
    fetchProfitQuotes(quoteIds),
    prisma.investor.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
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
  const investors: InvestorConfig[] = investorRows.map((inv) => ({
    id: inv.id,
    name: inv.name,
    shareType: inv.shareType as InvestorConfig["shareType"],
    ratePercent: inv.ratePercent !== null ? Number(inv.ratePercent) : null,
    rateUsdPerKg: inv.rateUsdPerKg !== null ? Number(inv.rateUsdPerKg) : null,
  }));
  const cnyProfitTiers: CnyProfitTiers = {
    base: tariffSettings?.cnyProfitPerYuanRub !== undefined && tariffSettings?.cnyProfitPerYuanRub !== null ? Number(tariffSettings.cnyProfitPerYuanRub) : 0,
    tier3000:
      tariffSettings?.cnyProfitPerYuanRubTier3000 !== undefined && tariffSettings?.cnyProfitPerYuanRubTier3000 !== null
        ? Number(tariffSettings.cnyProfitPerYuanRubTier3000)
        : null,
    tier10000:
      tariffSettings?.cnyProfitPerYuanRubTier10000 !== undefined && tariffSettings?.cnyProfitPerYuanRubTier10000 !== null
        ? Number(tariffSettings.cnyProfitPerYuanRubTier10000)
        : null,
    tier30000:
      tariffSettings?.cnyProfitPerYuanRubTier30000 !== undefined && tariffSettings?.cnyProfitPerYuanRubTier30000 !== null
        ? Number(tariffSettings.cnyProfitPerYuanRubTier30000)
        : null,
  };

  // Needed only for estimateCnyVolume — one batched sum per quote instead
  // of a query per quote.
  const attachedServiceSums = await prisma.quoteAttachedService.groupBy({
    by: ["quoteId"],
    where: { quoteId: { in: quotes.map((q) => q.id) } },
    _sum: { priceRub: true },
  });
  const attachedServicesByQuoteId = new Map(attachedServiceSums.map((s) => [s.quoteId, Number(s._sum.priceRub ?? 0)]));
  const quoteRealFinancials = await fetchQuoteRealFinancials(quotes.map((q) => q.id));

  return { quotes, cargoRates, premiumRates, investors, cnyProfitTiers, attachedServicesByQuoteId, quoteRealFinancials };
}

// The single entry point both routes call — guarantees the on-screen report
// and the downloaded PDF can never show different numbers for the same
// selection.
async function buildProfitReport(quoteIds: string[]) {
  const { quotes, cargoRates, premiumRates, investors, cnyProfitTiers, attachedServicesByQuoteId, quoteRealFinancials } =
    await loadRatesAndQuotes(quoteIds);
  const rows = quotes.map((q) =>
    computeQuoteBreakdown(
      q,
      cargoRates,
      premiumRates,
      investors,
      cnyProfitTiers,
      attachedServicesByQuoteId.get(q.id) ?? 0,
      quoteRealFinancials.get(q.id) ?? emptyQuoteRealFinancials(),
    ),
  );

  const totalRevenueRub = rows.reduce((sum, r) => sum + r.totalRub, 0);
  const totalProfitRub = rows.reduce((sum, r) => sum + r.totalProfitRub, 0);
  const profitPoolRub = rows.reduce((sum, r) => sum + Math.max(0, r.totalProfitRub), 0);
  const managerPremiumRub = rows.reduce((sum, r) => sum + r.managerPremiumRub, 0);

  // Every investor's cut — percent_of_profit, flat_per_cargo_kg, AND
  // remainder_share alike — is now computed PER ROW by computeQuoteShares
  // (see quote-profit.ts), one deal at a time, so summing across rows here
  // is a straight linear sum with no aggregate remainder math left to do.
  // This is deliberately per-row rather than "split one aggregate pool" —
  // per-row is what lets a partly-realized deal's services pool distribute
  // now while its cargo pool waits for delivery, exactly the split that
  // reworking this away from an aggregate pool was for. See PB-V5 chat
  // 2026-08-06.
  const investorShares = investors.map((inv) => ({
    id: inv.id,
    name: inv.name,
    shareType: inv.shareType,
    shareRub: rows.reduce((sum, r) => sum + (r.investorShares.find((s) => s.id === inv.id)?.shareRub ?? 0), 0),
  }));

  // Приход/расход/прибыль по блокам — просуммировано по всей выборке;
  // всегда сходится с totalProfitRub по построению (buyout.profitRub +
  // cargo.profitRub = totalProfitRub на каждой строке). См. PB-V5 chat
  // 2026-08-11.
  const totalBuyoutIncomeRub = rows.reduce((sum, r) => sum + r.buyout.incomeRub, 0);
  const totalBuyoutExpenseRub = rows.reduce((sum, r) => sum + r.buyout.expenseRub, 0);
  const totalBuyoutProfitRub = rows.reduce((sum, r) => sum + r.buyout.profitRub, 0);
  const totalCargoIncomeRub = rows.reduce((sum, r) => sum + r.cargo.incomeRub, 0);
  const totalCargoExpenseRub = rows.reduce((sum, r) => sum + r.cargo.expenseRub, 0);
  const totalCargoProfitRub = rows.reduce((sum, r) => sum + r.cargo.profitRub, 0);

  // investorShares was only needed above to sum into the totals-level
  // investorShares array — the per-quote table doesn't display it (same as
  // managerPremiumRub never being shown per-row either), so it's dropped
  // here rather than shipped to the client unused.
  const publicRows = rows.map((row) => {
    const publicRow = { ...row };
    delete (publicRow as Partial<typeof row>).investorShares;
    return publicRow;
  });

  return {
    rows: publicRows,
    totals: {
      totalRevenueRub,
      totalProfitRub,
      totalBuyoutIncomeRub,
      totalBuyoutExpenseRub,
      totalBuyoutProfitRub,
      totalCargoIncomeRub,
      totalCargoExpenseRub,
      totalCargoProfitRub,
      profitPoolRub,
      managerPremiumRub,
      investorShares,
    },
  };
}

function parseQuoteIds(body: unknown): string[] | null {
  const { quoteIds } = (body as { quoteIds?: unknown }) ?? {};
  if (!Array.isArray(quoteIds) || quoteIds.length === 0 || !quoteIds.every((id) => typeof id === "string")) return null;
  return quoteIds;
}

export { buildProfitReport, parseQuoteIds };
export type { ProfitQuote };
