import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// The single income статья that confirm-buyout's client-payment entries
// land in — flagged (not name-matched) so the owner can rename it freely.
// Self-heals if the flagged row is ever missing (e.g. deleted by mistake)
// instead of hard-failing the whole confirmation.
async function getOrCreateBuyoutIncomeCategory() {
  const existing = await prisma.cashCategory.findFirst({ where: { type: "income", isBuyoutIncomeDefault: true } });
  if (existing) return existing;
  return prisma.cashCategory.create({
    data: { type: "income", name: "Приход от клиента на выкуп и услуги", isBuyoutIncomeDefault: true },
  });
}

// Owner/senior only — deliberately excludes "manager" (including the
// quote's own manager) so the person who'd benefit from underreporting the
// real buyout spend can never be the one reporting it. Locks in the
// premium rate (10% normally, 35% if the client is a confirmed
// self-sourced client of whoever currently owns this quote) at the moment
// of confirmation — later changes to Client.selfSourcedConfirmed or a
// quote reassignment never retroactively touch an already-confirmed rate.
//
// Also captures the real payment RECEIVED from the client (actualClientPaymentRub
// — the mirror of actualBuyoutCny's real COST) and auto-creates/updates a
// linked income CashOrder in Отчёты по дням, so the manager never has to
// separately re-enter the same payment by hand in the cash ledger.
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
    include: { client: { select: { id: true, createdByManagerId: true, selfSourcedConfirmed: true } } },
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
  const { actualBuyoutCny, actualBuyoutRateUsed, actualClientPaymentRub, actualClientPaymentRateUsed } =
    (body as {
      actualBuyoutCny?: unknown;
      actualBuyoutRateUsed?: unknown;
      actualClientPaymentRub?: unknown;
      actualClientPaymentRateUsed?: unknown;
    }) ?? {};
  const cny = Number(actualBuyoutCny);
  const rate = Number(actualBuyoutRateUsed);
  if (!Number.isFinite(cny) || cny <= 0 || !Number.isFinite(rate) || rate <= 0) {
    return Response.json({ error: "Укажите потраченную сумму в юанях и курс." }, { status: 400 });
  }
  const paymentRub = Number(actualClientPaymentRub);
  const paymentRate = Number(actualClientPaymentRateUsed);
  if (!Number.isFinite(paymentRub) || paymentRub <= 0 || !Number.isFinite(paymentRate) || paymentRate <= 0) {
    return Response.json({ error: "Укажите сумму поступления от клиента в рублях и курс." }, { status: 400 });
  }

  const isSelfSourced = quote.client.selfSourcedConfirmed && quote.client.createdByManagerId === quote.managerId;
  const premiumRatePercent = isSelfSourced ? 35 : 10;

  const category = await getOrCreateBuyoutIncomeCategory();
  const paymentAmountCny = paymentRub / paymentRate;
  const comment = `Просчёт №${quote.displayId} — ${quote.productName}`;

  const cashOrder = quote.clientPaymentCashOrderId
    ? await prisma.cashOrder.update({
        where: { id: quote.clientPaymentCashOrderId },
        data: {
          categoryId: category.id,
          clientId: quote.client.id,
          currency: "rub",
          amount: paymentRub,
          cnyToCurrencyRate: paymentRate,
          amountCny: paymentAmountCny,
          comment,
        },
      })
    : await prisma.cashOrder.create({
        data: {
          type: "income",
          date: new Date(),
          categoryId: category.id,
          clientId: quote.client.id,
          currency: "rub",
          amount: paymentRub,
          cnyToCurrencyRate: paymentRate,
          amountCny: paymentAmountCny,
          comment,
          createdByManagerId: session.managerId,
        },
      });

  const updated = await prisma.quote.update({
    where: { id },
    data: {
      actualBuyoutCny: cny,
      actualBuyoutRateUsed: rate,
      buyoutFactConfirmed: true,
      buyoutConfirmedByManagerId: session.managerId,
      buyoutConfirmedAt: new Date(),
      buyoutPremiumRatePercent: premiumRatePercent,
      actualClientPaymentRub: paymentRub,
      actualClientPaymentRateUsed: paymentRate,
      clientPaymentCashOrderId: cashOrder.id,
    },
    select: {
      id: true,
      actualBuyoutCny: true,
      actualBuyoutRateUsed: true,
      buyoutFactConfirmed: true,
      buyoutConfirmedAt: true,
      buyoutPremiumRatePercent: true,
      actualClientPaymentRub: true,
      actualClientPaymentRateUsed: true,
      clientPaymentCashOrderId: true,
    },
  });

  return Response.json({ quote: updated });
}
