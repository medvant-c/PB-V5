import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote, canViewCargoCost } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { customProductionFeeForTier, stripCargoCostForNonOwner } from "@/lib/desk-services/quote-request";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const QUOTE_TYPES = ["standard", "expert", "pro"] as const;

// Narrow, single-purpose endpoint for the "присвоить тип поиска выбранным"
// bulk action in clients-tab.tsx — changes just the search tier and the
// search-service fee it drives, leaving every other frozen/quoted figure
// (goods price, cargo, buyout commission %, FX rates) untouched. totalRub
// is adjusted by the fee delta rather than fully recomputed, same
// reasoning as actualize-cargo's totalRub adjustment — this route isn't
// meant to re-price against today's tariffs (see /recalculate for that).
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.quote.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  if (!(await canAccessManagerQuote(session, existing.managerId))) {
    return Response.json({ error: "Нет доступа к этому просчёту." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { quoteType } = (body as { quoteType?: unknown }) ?? {};
  if (typeof quoteType !== "string" || !QUOTE_TYPES.includes(quoteType as (typeof QUOTE_TYPES)[number])) {
    return Response.json({ error: "Выберите тип просчёта." }, { status: 400 });
  }

  if (quoteType === existing.quoteType) {
    return Response.json({ quote: stripCargoCostForNonOwner(existing, await canViewCargoCost(session)) });
  }

  const tariffSettings = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
  if (!tariffSettings) {
    return Response.json({ error: "Тарифы не заданы — заполните вкладку «Тарифы»." }, { status: 400 });
  }

  // A manual override (see Quote.searchServiceFeeRubOverride) is an
  // explicit decision independent of tier — a tier switch must never
  // silently overwrite it, so it stays exactly as-is (delta 0) whenever
  // one is set.
  const newSearchServiceFeeRub =
    existing.searchServiceFeeRubOverride !== null
      ? Number(existing.searchServiceFeeRubOverride)
      : existing.searchFeeWaived
        ? 0
        : ({
            standard: Number(tariffSettings.standardPriceRub),
            expert: Number(tariffSettings.expertPriceRub),
            pro: Number(tariffSettings.proPriceRub),
          }[quoteType] ?? 0);
  const searchFeeDeltaRub = newSearchServiceFeeRub - Number(existing.searchServiceFeeRub);

  // "Производство под заказ" is tier-priced too — re-derive it for the new
  // tier the same way, so switching a custom-production quote from
  // Standart to Pro also moves its production fee, not just the search fee
  // — UNLESS a manual override is set (Quote.customProductionFeeRubOverride),
  // same "explicit decision, tier switch never overwrites it" rule as above.
  const newCustomProductionFeeRub =
    existing.customProductionFeeRubOverride !== null
      ? Number(existing.customProductionFeeRubOverride)
      : customProductionFeeForTier(tariffSettings, quoteType, existing.isCustomProduction);
  const customProductionFeeDeltaRub = newCustomProductionFeeRub - Number(existing.customProductionFeeRub);

  const quote = await prisma.quote.update({
    where: { id },
    data: {
      quoteType: quoteType as (typeof QUOTE_TYPES)[number],
      searchServiceFeeRub: newSearchServiceFeeRub,
      customProductionFeeRub: newCustomProductionFeeRub,
      // "Только карго" quotes never had the search fee/production fee in
      // totalRub to begin with (see Quote.isCargoOnly) — the fields above
      // still move for record-keeping, but the delta below must not, or a
      // tier switch would silently inflate a cargo-only total with a fee
      // the client was never actually charged.
      totalRub: existing.isCargoOnly
        ? Number(existing.totalRub)
        : Number(existing.totalRub) + searchFeeDeltaRub + customProductionFeeDeltaRub,
    },
  });

  return Response.json({ quote: stripCargoCostForNonOwner(quote, await canViewCargoCost(session)) });
}
