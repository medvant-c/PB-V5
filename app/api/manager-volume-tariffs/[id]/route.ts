import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canEditTariffs } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (!(await canEditTariffs(session))) {
    return Response.json({ error: "У вас нет прав на изменение тарифов." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.volumeTariff.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Тариф не найден." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { categoryLabel, rateUsdPerCbm, costUsdPerCbm } =
    (body as { categoryLabel?: unknown; rateUsdPerCbm?: unknown; costUsdPerCbm?: unknown }) ?? {};

  const data: Record<string, unknown> = {};
  if (typeof categoryLabel === "string" && categoryLabel.trim()) data.categoryLabel = categoryLabel.trim();
  if (rateUsdPerCbm !== undefined) {
    const rate = Number(rateUsdPerCbm);
    if (!Number.isFinite(rate) || rate < 0) return Response.json({ error: "Некорректная ставка." }, { status: 400 });
    data.rateUsdPerCbm = rate;
  }
  // Cost is stricter than the rest of this route: owner-only, even though a
  // senior with canEditTariffs can reach this far and edit the rate above.
  if (costUsdPerCbm !== undefined) {
    if (session.role !== "owner") {
      return Response.json({ error: "Себестоимость может менять только руководитель." }, { status: 403 });
    }
    const cost = Number(costUsdPerCbm);
    if (!Number.isFinite(cost) || cost < 0) {
      return Response.json({ error: "Некорректная себестоимость." }, { status: 400 });
    }
    data.costUsdPerCbm = cost;
  }

  const tariff = await prisma.volumeTariff.update({ where: { id }, data });
  let responseTariff: typeof tariff | Omit<typeof tariff, "costUsdPerCbm"> = tariff;
  if (session.role !== "owner") {
    const { costUsdPerCbm: strippedCost, ...rest } = tariff;
    void strippedCost;
    responseTariff = rest;
  }
  return Response.json({ tariff: responseTariff });
}

// No DELETE — unlike DensityTariff (multiple tiers per category, deleting
// one just removes that tier), VolumeTariff is one row per category and a
// "по объёму" quote in that category has nowhere else to look up a rate.
// Deleting would just break future quoting for that category with no
// upside; edit the rate instead.
