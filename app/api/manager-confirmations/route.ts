import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds, getTeamManagers } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

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
  const clientManagerFilter = visibleManagerIds === "all" ? {} : { createdByManagerId: { in: visibleManagerIds } };

  // Also doubles as the manager-scoped "who can I hand a client off to"
  // list — owner sees everyone, senior sees themself + their own
  // subordinates only. Deliberately NOT the owner-only /api/managers (that
  // one also gates quote-level reassignment, which stays owner-only).
  // clients-tab.tsx itself now gets this from the lighter /api/manager-
  // team-managers instead of this whole route — see that route's comment.
  const teamManagers = await getTeamManagers(session);

  // 2026-08-11: очередь свелась к двум сущностям — "чей клиент" (не про
  // доверие к цифрам, отдельная проверка) и USDT-курс. Семь очередей про
  // ручные ставки/факт выкупа убраны — прибыль больше не доверяет введённым
  // цифрам, а реальным деньгам в Кассе (см. lib/desk-services/quote-
  // profit.ts, computeRealBuyoutProfit/computeRealCargoProfit, план
  // mellow-forging-kay.md). Соответствующие confirm-*/route.ts роуты
  // оставлены в коде (не вызываются из UI) — проще откатить, если что.
  const [pendingClients, pendingUnassignedClients] = await Promise.all([
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
    pendingClients,
    pendingUnassignedClients,
    pendingUsdtRateConfirmation,
    teamManagers,
  });
}
