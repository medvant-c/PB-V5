import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canEditTariffs } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const tariffs = await prisma.volumeTariff.findMany({ orderBy: { categoryKey: "asc" } });
  // costUsdPerCbm is owner-confidential — same reasoning as
  // DensityTariff.costPerKgUsd (see app/api/manager-density-tariffs).
  const responseTariffs =
    session.role === "owner"
      ? tariffs
      : tariffs.map((t) => {
          const { costUsdPerCbm, ...rest } = t;
          void costUsdPerCbm;
          return rest;
        });
  return Response.json({ tariffs: responseTariffs });
}

// Adds a brand-new category's "по объёму" rate — categoryKey is unique per
// row (unlike DensityTariff, there's no density range to split by), so this
// is really only for a category that doesn't exist yet. Editing an
// existing one is app/api/manager-volume-tariffs/[id]/route.ts.
export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  if (!(await canEditTariffs(session))) {
    return Response.json({ error: "У вас нет прав на изменение тарифов." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const { categoryKey, categoryLabel, rateUsdPerCbm, costUsdPerCbm } =
    (body as {
      categoryKey?: unknown;
      categoryLabel?: unknown;
      rateUsdPerCbm?: unknown;
      costUsdPerCbm?: unknown;
    }) ?? {};

  if (typeof categoryKey !== "string" || !categoryKey.trim()) {
    return Response.json({ error: "Укажите ключ категории." }, { status: 400 });
  }
  if (typeof categoryLabel !== "string" || !categoryLabel.trim()) {
    return Response.json({ error: "Укажите название категории." }, { status: 400 });
  }
  const rate = Number(rateUsdPerCbm);
  if (!Number.isFinite(rate) || rate < 0) {
    return Response.json({ error: "Укажите тариф в $/м³." }, { status: 400 });
  }

  const existing = await prisma.volumeTariff.findUnique({ where: { categoryKey: categoryKey.trim() } });
  if (existing) {
    return Response.json({ error: "Тариф по объёму для этой категории уже есть — отредактируйте его." }, { status: 400 });
  }

  // Cost: owner-only input. Anyone else creating a tariff (a manager with
  // canEditTariffs) gets it pre-filled from the current global margin
  // default — same convention as DensityTariff's POST route.
  let cost: number;
  if (session.role === "owner" && costUsdPerCbm !== undefined) {
    const parsedCost = Number(costUsdPerCbm);
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      return Response.json({ error: "Себестоимость должна быть неотрицательным числом." }, { status: 400 });
    }
    cost = parsedCost;
  } else {
    const tariffSettings = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
    const defaultMargin = tariffSettings ? Number(tariffSettings.cargoVolumeMarginUsdPerCbm) : 50;
    cost = Math.max(0, rate - defaultMargin);
  }

  const tariff = await prisma.volumeTariff.create({
    data: {
      categoryKey: categoryKey.trim(),
      categoryLabel: categoryLabel.trim(),
      rateUsdPerCbm: rate,
      costUsdPerCbm: cost,
    },
  });

  let responseTariff: typeof tariff | Omit<typeof tariff, "costUsdPerCbm"> = tariff;
  if (session.role !== "owner") {
    const { costUsdPerCbm: strippedCost, ...rest } = tariff;
    void strippedCost;
    responseTariff = rest;
  }
  return Response.json({ tariff: responseTariff }, { status: 201 });
}
