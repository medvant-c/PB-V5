import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

// Owner-only bulk action: sets each selected quote's cargo discount (Quote.
// cargoDiscountUsd) to a percentage OF THE CARGO MARGIN (cargoDeliveryUsd -
// cargoCostUsd), not of the full cargo charge — e.g. margin $100, 30% →
// client's discount is $30, not 30% of the whole delivery fee. Deliberately
// does NOT re-derive cargoRateUsd/searchServiceFeeRub/FX (that's what
// recalculate/route.ts is for) — this only touches the cargo-discount slice
// of the formula (rawCargoDeliveryUsd - cargoDiscountUsd, converted to ₽,
// folded into totalRub), reusing quote-engine.ts's own exact arithmetic for
// that slice rather than the whole pipeline. See PB-V5 chat 2026-08-03.
export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner") {
    return Response.json({ error: "Массовая скидка на карго доступна только руководителю." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { quoteIds, discountPercent } = (body as { quoteIds?: unknown; discountPercent?: unknown }) ?? {};

  if (!Array.isArray(quoteIds) || quoteIds.length === 0 || !quoteIds.every((id) => typeof id === "string")) {
    return Response.json({ error: "Выберите хотя бы один просчёт." }, { status: 400 });
  }
  const percent = Number(discountPercent);
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    return Response.json({ error: "Укажите скидку от маржи — от 1 до 100%." }, { status: 400 });
  }

  const quotes = await prisma.quote.findMany({
    where: { id: { in: quoteIds as string[] } },
    select: {
      id: true,
      cargoDeliveryUsd: true,
      cargoDeliveryRub: true,
      cargoDiscountUsd: true,
      cargoCostUsd: true,
      usdRateUsed: true,
      totalRub: true,
    },
  });

  let updated = 0;
  let skipped = 0;
  for (const quote of quotes) {
    // The raw (pre-discount) cargo charge — reconstructed from what's
    // already stored, since cargoDeliveryUsd is always net of the current
    // cargoDiscountUsd (see quote-engine.ts: cargoDeliveryUsd =
    // rawCargoDeliveryUsd - cargoDiscountUsd).
    const rawCargoUsd = Number(quote.cargoDeliveryUsd) + Number(quote.cargoDiscountUsd);
    const marginUsd = Number(quote.cargoDeliveryUsd) - Number(quote.cargoCostUsd);
    if (marginUsd <= 0) {
      // No margin to discount from (rate override at or below cost, or an
      // existing discount already ate the whole margin) — skip rather than
      // apply a zero/negative "discount".
      skipped++;
      continue;
    }

    const newDiscountUsd = Math.min(Math.max(Number((marginUsd * (percent / 100)).toFixed(2)), 0), rawCargoUsd);
    const newCargoDeliveryUsd = rawCargoUsd - newDiscountUsd;
    const newCargoDeliveryRub = newCargoDeliveryUsd * Number(quote.usdRateUsed);
    // Every other term in totalRub (goods, China delivery, search fee,
    // buyout commission, производство под заказ, доп. услуги) is untouched
    // by the cargo discount — see quote-engine.ts's totalRub sum — so
    // shifting totalRub by exactly the cargoDeliveryRub delta is exact, not
    // an approximation.
    const newTotalRub = Number(quote.totalRub) - Number(quote.cargoDeliveryRub) + newCargoDeliveryRub;

    await prisma.quote.update({
      where: { id: quote.id },
      data: {
        cargoDiscountUsd: newDiscountUsd,
        cargoDeliveryUsd: newCargoDeliveryUsd,
        cargoDeliveryRub: newCargoDeliveryRub,
        totalRub: newTotalRub,
      },
    });
    updated++;
  }

  return Response.json({ updated, skipped });
}
