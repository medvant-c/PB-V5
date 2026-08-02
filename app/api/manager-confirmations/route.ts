import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
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
  // list for clients-tab.tsx's transfer dropdown — owner sees everyone,
  // senior sees themself + their own subordinates only. Deliberately NOT
  // the owner-only /api/managers (that one also gates quote-level
  // reassignment, which stays owner-only).
  const teamManagers = await prisma.manager.findMany({
    where: { active: true, ...(session.role === "owner" ? {} : { OR: [{ id: session.managerId }, { supervisorId: session.managerId }] }) },
    orderBy: { displayId: "asc" },
    select: { id: true, name: true },
  });

  const [pendingBuyouts, pendingClients, pendingCargoRates, pendingCnyRates, pendingUsdRates, pendingBuyoutCommissions] = await Promise.all([
    prisma.quote.findMany({
      where: { ...managerFilter, status: { in: POST_BUYOUT_STATUSES }, buyoutFactConfirmed: false },
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
      where: { ...managerFilter, cargoRateUsdOverride: { not: null }, cargoRateOverrideConfirmed: false },
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
      where: { ...managerFilter, cnyRateRubOverride: { not: null }, cnyRateOverrideConfirmed: false },
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
      where: { ...managerFilter, usdRateRubOverride: { not: null }, usdRateOverrideConfirmed: false },
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
      where: { ...managerFilter, buyoutCommissionPercentOverride: { not: null }, buyoutCommissionOverrideConfirmed: false },
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
  ]);

  return Response.json({
    pendingBuyouts,
    pendingClients,
    pendingCargoRates,
    pendingCnyRates,
    pendingUsdRates,
    pendingBuyoutCommissions,
    teamManagers,
  });
}
