import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

// Owner/senior-only sign-off on TariffSettings.usdtRateCny — same gate as
// confirm-usd-rate/route.ts's per-quote equivalent, just for the single
// shared "Счёт на выкуп" USDT rate instead of a per-quote override.
// TariffSettings is append-only (see prisma/schema.prisma), so "confirming"
// can't PATCH the existing row in place — it creates a new row carrying
// every other field forward unchanged, same convention as every other
// Тарифы save (manager-tariffs/route.ts, telegram-cny-rate-webhook/route.ts).
export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior") {
    return Response.json({ error: "Подтвердить курс USDT может только старший менеджер или руководитель." }, { status: 403 });
  }

  const current = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
  if (!current) {
    return Response.json({ error: "Тарифы ещё не заданы." }, { status: 404 });
  }
  if (current.usdtRateCny === null) {
    return Response.json({ error: "Курс USDT ещё не задан — сначала введите его во вкладке «Тарифы»." }, { status: 400 });
  }
  if (current.usdtRateCnyConfirmed) {
    return Response.json({ error: "Курс USDT уже подтверждён." }, { status: 400 });
  }

  const updated = await prisma.tariffSettings.create({
    data: {
      cnyRateRub: current.cnyRateRub,
      cnyRateRubTier3000: current.cnyRateRubTier3000,
      cnyRateRubTier10000: current.cnyRateRubTier10000,
      cnyRateRubTier30000: current.cnyRateRubTier30000,
      usdtRateCny: current.usdtRateCny,
      usdtRateCnyConfirmed: true,
      usdtRateCnyConfirmedByManagerId: session.managerId,
      usdtRateCnyConfirmedAt: new Date(),
      usdRateRub: current.usdRateRub,
      volumeRateUsdPerCbm: current.volumeRateUsdPerCbm,
      standardPriceRub: current.standardPriceRub,
      expertPriceRub: current.expertPriceRub,
      proPriceRub: current.proPriceRub,
      customProductionStandardRub: current.customProductionStandardRub,
      customProductionExpertRub: current.customProductionExpertRub,
      customProductionProRub: current.customProductionProRub,
      managerCargoRateUsdPerKg: current.managerCargoRateUsdPerKg,
      managerCargoRateUsdPerM3: current.managerCargoRateUsdPerM3,
      cargoDensityMarginUsdPerKg: current.cargoDensityMarginUsdPerKg,
      cargoVolumeMarginUsdPerCbm: current.cargoVolumeMarginUsdPerCbm,
      cnyProfitPerYuanRub: current.cnyProfitPerYuanRub,
      cnyProfitPerYuanRubTier3000: current.cnyProfitPerYuanRubTier3000,
      cnyProfitPerYuanRubTier10000: current.cnyProfitPerYuanRubTier10000,
      cnyProfitPerYuanRubTier30000: current.cnyProfitPerYuanRubTier30000,
      createdByManagerId: session.managerId,
    },
  });

  return Response.json({
    settings: {
      usdtRateCny: updated.usdtRateCny,
      usdtRateCnyConfirmed: updated.usdtRateCnyConfirmed,
      usdtRateCnyConfirmedAt: updated.usdtRateCnyConfirmedAt,
    },
  });
}
