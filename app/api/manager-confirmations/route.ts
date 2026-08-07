import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds, getTeamManagers } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import type { QuoteStatus } from "@/lib/quote-statuses";

// Same statuses as POST_BUYOUT_STATUSES in .../[id]/status/route.ts — kept
// as a literal copy rather than a shared import since this is the only
// other place that needs it and a shared lib file felt like overkill for
// one array.
const POST_BUYOUT_STATUSES: QuoteStatus[] = ["in_transit_to_warehouse", "delivered_to_warehouse", "sent_to_client", "handed_to_client"];

// Owner/senior only — everything a manager did that now needs a second
// person's sign-off before it counts toward real money (premium rate),
// in one place instead of the senior having to hunt through every client.
// Sorted oldest-first (longest waiting), same "don't let it go stale"
// instinct as the in_progress banner elsewhere in the app.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior") {
    return Response.json({ error: "Доступно только старшему менеджеру и руководителю." }, { status: 403 });
  }

  const visibleManagerIds = await getVisibleManagerIds(session);
  const managerFilter = visibleManagerIds === "all" ? {} : { managerId: { in: visibleManagerIds } };
  const clientManagerFilter = visibleManagerIds === "all" ? {} : { createdByManagerId: { in: visibleManagerIds } };

  // Also doubles as the manager-scoped "who can I hand a client off to"
  // list — owner sees everyone, senior sees themself + their own
  // subordinates only. Deliberately NOT the owner-only /api/managers (that
  // one also gates quote-level reassignment, which stays owner-only).
  // clients-tab.tsx itself now gets this from the lighter /api/manager-
  // team-managers instead of this whole route — see that route's comment.
  const teamManagers = await getTeamManagers(session);

  const [
    pendingBuyouts,
    pendingClients,
    pendingCargoRates,
    pendingCnyRates,
    pendingUsdRates,
    pendingBuyoutCommissions,
    pendingSearchFees,
    pendingCustomProductionFees,
    pendingUnassignedClients,
  ] = await Promise.all([
    prisma.quote.findMany({
      where: { ...managerFilter, status: { in: POST_BUYOUT_STATUSES }, buyoutFactConfirmed: false, deletedAt: null },
      orderBy: { statusChangedAt: "asc" },
      select: {
        id: true,
        displayId: true,
        productName: true,
        status: true,
        statusChangedAt: true,
        totalPriceCny: true,
        totalRub: true,
        searchServiceFeeRub: true,
        customProductionFeeRub: true,
        buyoutCommissionRub: true,
        cnyRateUsed: true,
        manager: { select: { id: true, name: true } },
        client: { select: { name: true, company: true } },
      },
    }),
    prisma.client.findMany({
      where: { ...clientManagerFilter, selfSourcedClaimed: true, selfSourcedConfirmed: false },
      orderBy: { selfSourcedClaimedAt: "asc" },
      select: {
        id: true,
        displayId: true,
        name: true,
        company: true,
        selfSourcedClaimedAt: true,
        createdByManager: { select: { id: true, name: true } },
      },
    }),
    // A manual cargo rate (Quote.cargoRateUsdOverride) needs owner/senior
    // sign-off — the real supplier cost + a proof screenshot — before
    // profit accounting for it can be trusted. See PB-V5 chat 2026-07-30.
    prisma.quote.findMany({
      where: { ...managerFilter, cargoRateUsdOverride: { not: null }, cargoRateOverrideConfirmed: false, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        displayId: true,
        productName: true,
        createdAt: true,
        cargoRateUsd: true,
        cargoRateUsdOverride: true,
        deliveryPricingMode: true,
        manager: { select: { id: true, name: true } },
        client: { select: { name: true, company: true } },
      },
    }),
    // A manual ¥→₽ rate (Quote.cnyRateRubOverride) needs the same
    // owner/senior sign-off — proof it's a real agreed rate. See PB-V5
    // chat 2026-07-30.
    prisma.quote.findMany({
      where: { ...managerFilter, cnyRateRubOverride: { not: null }, cnyRateOverrideConfirmed: false, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        displayId: true,
        productName: true,
        createdAt: true,
        cnyRateUsed: true,
        cnyRateRubOverride: true,
        manager: { select: { id: true, name: true } },
        client: { select: { name: true, company: true } },
      },
    }),
    // A manual $→₽ rate (Quote.usdRateRubOverride) needs the same
    // owner/senior sign-off — proof it's a real agreed rate. See PB-V5
    // chat 2026-08-02.
    prisma.quote.findMany({
      where: { ...managerFilter, usdRateRubOverride: { not: null }, usdRateOverrideConfirmed: false, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        displayId: true,
        productName: true,
        createdAt: true,
        usdRateUsed: true,
        usdRateRubOverride: true,
        manager: { select: { id: true, name: true } },
        client: { select: { name: true, company: true } },
      },
    }),
    // A manual buyout-commission % override needs the same owner/senior
    // sign-off — proof it's a real agreed commission, not made up. See
    // PB-V5 chat 2026-07-31.
    prisma.quote.findMany({
      where: { ...managerFilter, buyoutCommissionPercentOverride: { not: null }, buyoutCommissionOverrideConfirmed: false, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        displayId: true,
        productName: true,
        createdAt: true,
        buyoutCommissionPercent: true,
        buyoutCommissionPercentOverride: true,
        manager: { select: { id: true, name: true } },
        client: { select: { name: true, company: true } },
      },
    }),
    // A manual search-service-fee override needs the same owner/senior
    // sign-off — this fee is 100% margin and feeds straight into the
    // manager's own premium. See PB-V5 chat 2026-08-06.
    prisma.quote.findMany({
      where: { ...managerFilter, searchServiceFeeRubOverride: { not: null }, searchServiceFeeOverrideConfirmed: false, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        displayId: true,
        productName: true,
        createdAt: true,
        searchServiceFeeRub: true,
        searchServiceFeeRubOverride: true,
        manager: { select: { id: true, name: true } },
        client: { select: { name: true, company: true } },
      },
    }),
    // Same for a manual "производство под заказ" fee override.
    prisma.quote.findMany({
      where: {
        ...managerFilter,
        customProductionFeeRubOverride: { not: null },
        customProductionFeeOverrideConfirmed: false,
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        displayId: true,
        productName: true,
        createdAt: true,
        customProductionFeeRub: true,
        customProductionFeeRubOverride: true,
        manager: { select: { id: true, name: true } },
        client: { select: { name: true, company: true } },
      },
    }),
    // A client who self-registered at /account (no manager ever touched
    // them — createdByManagerId is only ever null right after that, or for
    // a handful of legacy rows from before this field existed) sits
    // invisible to the whole team until someone assigns them. Owner-only:
    // deciding who picks up a brand-new lead is the руководитель's call,
    // not something a senior triages on their own. Assignment itself
    // reuses the existing client-transfer PATCH (see clients-tab.tsx's
    // handleTransfer), not a new endpoint. See PB-V5 chat 2026-08-03.
    session.role === "owner"
      ? prisma.client.findMany({
          where: { createdByManagerId: null },
          orderBy: { createdAt: "asc" },
          select: { id: true, displayId: true, name: true, company: true, email: true, phone: true, source: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  // Single shared rate (TariffSettings.usdtRateCny), not per-quote — so
  // this is one object or null, not a list like everything else above. See
  // app/api/manager-tariffs/confirm-usdt-rate/route.ts.
  const currentTariffs = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
  const pendingUsdtRateConfirmation =
    currentTariffs && currentTariffs.usdtRateCny !== null && !currentTariffs.usdtRateCnyConfirmed
      ? { usdtRateCny: currentTariffs.usdtRateCny, createdAt: currentTariffs.createdAt }
      : null;

  return Response.json({
    pendingBuyouts,
    pendingClients,
    pendingCargoRates,
    pendingCnyRates,
    pendingUsdRates,
    pendingBuyoutCommissions,
    pendingSearchFees,
    pendingCustomProductionFees,
    pendingUnassignedClients,
    pendingUsdtRateConfirmation,
    teamManagers,
  });
}
