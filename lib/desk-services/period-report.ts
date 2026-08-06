import "server-only";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/lib/system-settings";
import {
  cargoProfitRub,
  effectiveInvestorRatePercent,
  factualManagerPremiumRub,
  factualSourceProfits,
  flatCargoBonusRub,
  fxProfitRub,
  investorCargoShareRub,
  isPremiumEligiblePaymentCategory,
  splitRemainderRub,
  sumAlreadyPaidPremium,
  sumAlreadyPaidProfitRub,
  type InvestorConfig,
  type QuoteProfitFields,
} from "@/lib/desk-services/quote-profit";

// "Реальные деньги за период" — в отличие от app/api/manager-profit-report
// (which asks "сколько заработаем НА ЭТИХ сделках, если/когда они
// реализуются"), this answers "сколько реально заработала компания МЕЖДУ
// этими двумя датами" — i.e. по датам, когда деньги/факты реально
// произошли, not by quote creation date. One quote's profit can legitimately
// spread across several different periods, in up to three independent
// events, each dated by when it actually happened:
//
//   1. Партиальная оплата услуги ("Приходный ордер" до подтверждения
//      факта выкупа) — dated by QuotePaymentAllocation.createdAt.
//   2. Подтверждение факта выкупа (реальная маржа по товару/услугам/
//      скидке/курсу становится известна) — dated by Quote.buyoutConfirmedAt.
//   3. Выдача карго клиенту (реальная маржа по карго + премия за карго
//      фиксируются) — dated by Quote.statusChangedAt, gated on
//      cargoBonusRatePercent having been set (see status/route.ts — that's
//      the only place it gets set, always at the handed_to_client
//      transition, so statusChangedAt at that moment IS the event date).
//
// Never double-counts: a quote's allocations are only counted here while it
// ISN'T YET confirmed (once confirmed, its confirm-event residual already
// subtracts everything previously paid via sumAlreadyPaidProfitRub/
// sumAlreadyPaidPremium — the same anti-double-pay mechanism the dashboard
// and profit-report already use, just applied at the moment of confirmation
// instead of "right now"). Cargo is its own axis entirely — cargoProfitRub
// is never part of estimatedSourceProfits/factualSourceProfits to begin
// with. See PB-V5 chat 2026-08-06.
interface PeriodRange {
  from: Date;
  to: Date;
}

interface PremiumRates {
  normalRatePercent: number;
  selfSourcedProscetRatePercent: number;
  selfSourcedBuyoutDiscountRatePercent: number;
}

// One "event" — a dated slice of profit realized for one quote, already
// split into "the part that's manager premium" vs. "the part left over for
// investors after the client the manager premium was for is subtracted" so
// every event can be folded into the running totals the exact same way
// regardless of which of the three sources it came from.
interface ProfitEvent {
  managerId: string;
  client: { vladShareRatePercentOverride: unknown };
  profitRub: number;
  managerPremiumRub: number;
  // Only cargo events carry cargo-share info for flat_per_cargo_kg
  // investors (Юра) — everything else is null.
  cargo: { totalWeightKg: unknown; usdRateUsed: unknown } | null;
}

const CONFIRMED_QUOTE_SELECT = {
  id: true,
  displayId: true,
  productName: true,
  managerId: true,
  totalPriceRub: true,
  chinaDeliveryRub: true,
  cargoDeliveryRub: true,
  cargoCostRub: true,
  searchServiceFeeRub: true,
  customProductionFeeRub: true,
  cnyRateUsed: true,
  buyoutFactConfirmed: true,
  actualBuyoutCny: true,
  actualBuyoutRateUsed: true,
  actualSupplierDiscountCny: true,
  buyoutSelfSourcedBoost: true,
  packagingCostRub: true,
  insuranceCostRub: true,
  mskExpensesRub: true,
  isCargoOnly: true,
  totalRub: true,
  client: { select: { id: true, name: true, selfSourcedConfirmed: true, createdByManagerId: true, vladShareRatePercentOverride: true } },
  paymentAllocations: { select: { category: true, amountRub: true, premiumRub: true } },
} as const;

async function loadCommon() {
  const [tariffSettings, systemSettings, investorRows, managers] = await Promise.all([
    prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } }),
    getSystemSettings(),
    prisma.investor.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.manager.findMany({ where: { active: true }, select: { id: true, name: true } }),
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
  return { cargoRates, premiumRates, investors, managers };
}

async function buildPeriodReport({ from, to }: PeriodRange) {
  const { cargoRates, premiumRates, investors, managers } = await loadCommon();

  const events: ProfitEvent[] = [];

  // --- 1. Allocation events: partial payments made BEFORE the quote's
  // buyout fact got confirmed (once confirmed, its allocations are folded
  // into event #2's residual instead — see sumAlreadyPaidProfitRub/
  // sumAlreadyPaidPremium below — so an allocation must never contribute
  // here AND there). Filtered on the quote's CURRENT buyoutFactConfirmed
  // flag would be wrong: a quote paid partially last month and confirmed
  // THIS month is confirmed=true right now, but that payment still
  // genuinely happened before confirmation — comparing against
  // buyoutConfirmedAt (not "is it confirmed as of today") is what actually
  // matters here. See PB-V5 chat 2026-08-06.
  const allocationsInPeriod = await prisma.quotePaymentAllocation.findMany({
    where: { createdAt: { gte: from, lt: to }, quote: { deletedAt: null } },
    select: {
      category: true,
      amountRub: true,
      premiumRub: true,
      createdAt: true,
      quote: {
        select: {
          managerId: true,
          buyoutFactConfirmed: true,
          buyoutConfirmedAt: true,
          client: { select: { vladShareRatePercentOverride: true } },
        },
      },
    },
  });
  for (const a of allocationsInPeriod) {
    if (a.quote.buyoutFactConfirmed && a.quote.buyoutConfirmedAt && a.createdAt >= a.quote.buyoutConfirmedAt) continue;
    // Same rule as the dashboard's already-realized-profit fix: only
    // 100%-margin categories count as profit the moment the money arrives;
    // goods/china_delivery carry unknown margin until confirm-buyout.
    if (!isPremiumEligiblePaymentCategory(a.category)) continue;
    events.push({
      managerId: a.quote.managerId,
      client: a.quote.client,
      profitRub: Number(a.amountRub),
      managerPremiumRub: Number(a.premiumRub),
      cargo: null,
    });
  }

  // --- 2. Confirm-buyout events: the residual left over once already-paid
  // allocations (from ANY period, not just this one) are subtracted, so a
  // quote paid partially in one period and confirmed in a later one never
  // double-counts the part already realized earlier. ---
  const confirmedQuotes = await prisma.quote.findMany({
    where: { buyoutFactConfirmed: true, buyoutConfirmedAt: { gte: from, lt: to }, deletedAt: null },
    select: CONFIRMED_QUOTE_SELECT,
  });
  for (const q of confirmedQuotes) {
    const fields: QuoteProfitFields = q;
    const { proscetRub, buyoutRub, discountRub } = factualSourceProfits(fields);
    const fx = fxProfitRub(fields);
    const alreadyPaidProfit = sumAlreadyPaidProfitRub(q.paymentAllocations);
    const residualProscetRub = Math.max(0, proscetRub - alreadyPaidProfit.proscetRub);
    const residualBuyoutRub = Math.max(0, buyoutRub + discountRub - alreadyPaidProfit.buyoutRub);
    const profitRub = residualProscetRub + residualBuyoutRub + fx;

    const alreadyPaidPremium = sumAlreadyPaidPremium(q.paymentAllocations);
    const fullPremiumRub = factualManagerPremiumRub(
      { proscetRub, buyoutRub, discountRub },
      Boolean(q.buyoutSelfSourcedBoost),
      premiumRates,
      alreadyPaidPremium,
    );
    const residualPremiumRub = Math.max(
      0,
      fullPremiumRub - alreadyPaidPremium.proscetRub - alreadyPaidPremium.buyoutRub,
    );

    events.push({
      managerId: q.managerId,
      client: q.client,
      profitRub,
      managerPremiumRub: residualPremiumRub,
      cargo: null,
    });
  }

  // --- 3. Cargo events: карго margin + карго premium, fixed the moment
  // cargoBonusRatePercent gets set (always at handed_to_client, see
  // status/route.ts) — a separate timeline from confirm-buyout entirely. ---
  const cargoQuotes = await prisma.quote.findMany({
    where: { cargoBonusRatePercent: { not: null }, statusChangedAt: { gte: from, lt: to }, deletedAt: null },
    select: {
      managerId: true,
      cargoDeliveryRub: true,
      cargoCostRub: true,
      cargoBonusRatePercent: true,
      totalWeightKg: true,
      totalVolumeM3: true,
      densityKgM3: true,
      deliveryPricingMode: true,
      usdRateUsed: true,
      client: { select: { id: true, vladShareRatePercentOverride: true, selfSourcedConfirmed: true, createdByManagerId: true } },
    },
  });
  for (const q of cargoQuotes) {
    // cargoProfitRub only ever reads cargoDeliveryRub/cargoCostRub off
    // QuoteProfitFields — the rest of that shared interface is irrelevant
    // here, filled with harmless zeros rather than selecting 10 more unused
    // columns just to satisfy the wider type.
    const cargo = cargoProfitRub({
      totalRub: 0,
      totalPriceRub: 0,
      chinaDeliveryRub: 0,
      cargoDeliveryRub: q.cargoDeliveryRub,
      cargoCostRub: q.cargoCostRub,
      searchServiceFeeRub: 0,
      customProductionFeeRub: 0,
      cnyRateUsed: 1,
      buyoutFactConfirmed: false,
      actualBuyoutCny: 0,
      actualBuyoutRateUsed: 0,
      actualSupplierDiscountCny: 0,
      packagingCostRub: 0,
      insuranceCostRub: 0,
      mskExpensesRub: 0,
      isCargoOnly: false,
    });
    const cargoBonusRub = Number(q.cargoBonusRatePercent) > 0 ? flatCargoBonusRub(q, cargoRates) : 0;
    events.push({
      managerId: q.managerId,
      client: q.client,
      profitRub: cargo,
      managerPremiumRub: cargoBonusRub,
      cargo: { totalWeightKg: q.totalWeightKg, usdRateUsed: q.usdRateUsed },
    });
  }

  // --- Fold events into per-manager premium + a shared investor pool ---
  const managerPremiumByManagerId = new Map<string, number>();
  let companyProfitRub = 0;
  let totalManagerPremiumRub = 0;
  let percentOfProfitAndFlatSharesRub = 0;
  const investorShareById = new Map<string, number>();

  for (const inv of investors) {
    if (inv.shareType === "percent_of_profit" || inv.shareType === "flat_per_cargo_kg") investorShareById.set(inv.id, 0);
  }

  for (const ev of events) {
    companyProfitRub += ev.profitRub;
    totalManagerPremiumRub += ev.managerPremiumRub;
    managerPremiumByManagerId.set(ev.managerId, (managerPremiumByManagerId.get(ev.managerId) ?? 0) + ev.managerPremiumRub);

    const poolAfterPremiumRub = Math.max(0, ev.profitRub - ev.managerPremiumRub);
    for (const inv of investors) {
      if (inv.shareType === "percent_of_profit") {
        const rate = effectiveInvestorRatePercent(ev.client, Number(inv.ratePercent ?? 0));
        const shareRub = poolAfterPremiumRub * (rate / 100);
        percentOfProfitAndFlatSharesRub += shareRub;
        investorShareById.set(inv.id, (investorShareById.get(inv.id) ?? 0) + shareRub);
      } else if (inv.shareType === "flat_per_cargo_kg" && ev.cargo) {
        const shareRub = investorCargoShareRub(ev.cargo.totalWeightKg, Number(inv.rateUsdPerKg ?? 0), ev.cargo.usdRateUsed);
        percentOfProfitAndFlatSharesRub += shareRub;
        investorShareById.set(inv.id, (investorShareById.get(inv.id) ?? 0) + shareRub);
      }
    }
  }

  const remainderInvestors = investors.filter((inv) => inv.shareType === "remainder_share");
  const remainderPoolRub = companyProfitRub - totalManagerPremiumRub - percentOfProfitAndFlatSharesRub;
  const perRemainderShareRub = splitRemainderRub(remainderPoolRub, remainderInvestors.length);

  // --- "Уже выплачено за период" — expense ордера в кассе с явно
  // привязанной статьёй (см. CashCategory.payoutTarget, PB-V5 chat
  // 2026-08-05), той же связкой, что уже подставляет сумму в расходном
  // ордере — просто сумма за весь период, а не по одному клиенту. ---
  const payoutCategories = await prisma.cashCategory.findMany({
    where: { type: "expense", payoutTarget: { not: null } },
    select: { id: true, name: true, payoutTarget: true, linkedInvestorId: true },
  });
  const payoutOrders = await prisma.cashOrder.findMany({
    where: { type: "expense", categoryId: { in: payoutCategories.map((c) => c.id) }, date: { gte: from, lt: to } },
    select: { categoryId: true, amountCny: true, client: { select: { createdByManagerId: true } } },
  });
  const tariffSettings = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
  const cnyRateRub = tariffSettings ? Number(tariffSettings.cnyRateRub) : null;

  const alreadyPaidRubByManagerId = new Map<string, number>();
  const alreadyPaidRubByInvestorId = new Map<string, number>();
  for (const order of payoutOrders) {
    const category = payoutCategories.find((c) => c.id === order.categoryId);
    if (!category || !cnyRateRub) continue;
    const amountRub = Number(order.amountCny) * cnyRateRub;
    if (category.payoutTarget === "assigned_manager") {
      const managerId = order.client?.createdByManagerId;
      if (!managerId) continue;
      alreadyPaidRubByManagerId.set(managerId, (alreadyPaidRubByManagerId.get(managerId) ?? 0) + amountRub);
    } else if (category.payoutTarget === "investor" && category.linkedInvestorId) {
      alreadyPaidRubByInvestorId.set(
        category.linkedInvestorId,
        (alreadyPaidRubByInvestorId.get(category.linkedInvestorId) ?? 0) + amountRub,
      );
    }
  }

  const managerPayouts = managers
    .map((m) => {
      const owedRub = managerPremiumByManagerId.get(m.id) ?? 0;
      const paidRub = alreadyPaidRubByManagerId.get(m.id) ?? 0;
      return { managerId: m.id, managerName: m.name, owedRub, paidRub, remainingRub: owedRub - paidRub };
    })
    .filter((row) => row.owedRub > 0 || row.paidRub > 0);

  const investorPayouts = investors.map((inv) => {
    const owedRub =
      inv.shareType === "remainder_share" ? perRemainderShareRub : (investorShareById.get(inv.id) ?? 0);
    const paidRub = alreadyPaidRubByInvestorId.get(inv.id) ?? 0;
    return { investorId: inv.id, investorName: inv.name, shareType: inv.shareType, owedRub, paidRub, remainingRub: owedRub - paidRub };
  });

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    companyProfitRub,
    totalManagerPremiumRub,
    investorPoolRub: percentOfProfitAndFlatSharesRub + Math.max(0, remainderPoolRub),
    managerPayouts,
    investorPayouts,
    cnyRateRub,
  };
}

export { buildPeriodReport };
export type { PeriodRange };
