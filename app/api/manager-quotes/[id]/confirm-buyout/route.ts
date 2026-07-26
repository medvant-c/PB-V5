import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Owner/senior only — deliberately excludes "manager" (including the
// quote's own manager) so the person who'd benefit from underreporting the
// real buyout spend can never be the one reporting it. Locks in the
// premium rate (10% normally, 35% if the client is a confirmed
// self-sourced client of whoever currently owns this quote) at the moment
// of confirmation — later changes to Client.selfSourcedConfirmed or a
// quote reassignment never retroactively touch an already-confirmed rate.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior") {
    return Response.json(
      { error: "Подтвердить факт по выкупу может только старший менеджер или руководитель." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: { client: { select: { createdByManagerId: true, selfSourcedConfirmed: true } } },
  });
  if (!quote) {
    return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { actualBuyoutCny, actualBuyoutRateUsed } = (body as { actualBuyoutCny?: unknown; actualBuyoutRateUsed?: unknown }) ?? {};
  const cny = Number(actualBuyoutCny);
  const rate = Number(actualBuyoutRateUsed);
  if (!Number.isFinite(cny) || cny <= 0 || !Number.isFinite(rate) || rate <= 0) {
    return Response.json({ error: "Укажите потраченную сумму в юанях и курс." }, { status: 400 });
  }

  const isSelfSourced = quote.client.selfSourcedConfirmed && quote.client.createdByManagerId === quote.managerId;
  const premiumRatePercent = isSelfSourced ? 35 : 10;

  const updated = await prisma.quote.update({
    where: { id },
    data: {
      actualBuyoutCny: cny,
      actualBuyoutRateUsed: rate,
      buyoutFactConfirmed: true,
      buyoutConfirmedByManagerId: session.managerId,
      buyoutConfirmedAt: new Date(),
      buyoutPremiumRatePercent: premiumRatePercent,
    },
    select: {
      id: true,
      actualBuyoutCny: true,
      actualBuyoutRateUsed: true,
      buyoutFactConfirmed: true,
      buyoutConfirmedAt: true,
      buyoutPremiumRatePercent: true,
    },
  });

  return Response.json({ quote: updated });
}
