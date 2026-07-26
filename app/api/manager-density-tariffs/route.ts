import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canEditTariffs } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const tiers = await prisma.densityTariff.findMany({
    orderBy: [{ categoryKey: "asc" }, { minDensity: "asc" }],
  });
  // costPerKgUsd is owner-confidential — same reasoning as the global
  // margin fields on TariffSettings (see app/api/manager-tariffs).
  const responseTiers =
    session.role === "owner"
      ? tiers
      : tiers.map((t) => {
          const { costPerKgUsd, ...rest } = t;
          void costPerKgUsd;
          return rest;
        });
  return Response.json({ tiers: responseTiers });
}

// Adds one density tier to a category — a brand-new category or an extra
// tier in an existing one. Editing/deleting an existing tier is
// app/api/manager-density-tariffs/[id]/route.ts — old tiers already used by
// a Quote stay untouched regardless, since Quote snapshots the rate it
// found, not a reference to this row.
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

  const { categoryKey, categoryLabel, minDensity, maxDensity, ratePerKgUsd, costPerKgUsd } =
    (body as {
      categoryKey?: unknown;
      categoryLabel?: unknown;
      minDensity?: unknown;
      maxDensity?: unknown;
      ratePerKgUsd?: unknown;
      costPerKgUsd?: unknown;
    }) ?? {};

  if (typeof categoryKey !== "string" || !categoryKey.trim()) {
    return Response.json({ error: "Укажите ключ категории." }, { status: 400 });
  }
  if (typeof categoryLabel !== "string" || !categoryLabel.trim()) {
    return Response.json({ error: "Укажите название категории." }, { status: 400 });
  }
  const min = Number(minDensity);
  const rate = Number(ratePerKgUsd);
  if (!Number.isFinite(min) || min < 0) {
    return Response.json({ error: "Укажите нижнюю границу плотности." }, { status: 400 });
  }
  if (!Number.isFinite(rate) || rate < 0) {
    return Response.json({ error: "Укажите тариф в $/кг." }, { status: 400 });
  }
  const max = maxDensity === null || maxDensity === undefined || maxDensity === "" ? null : Number(maxDensity);
  if (max !== null && (!Number.isFinite(max) || max <= min)) {
    return Response.json({ error: "Верхняя граница плотности должна быть больше нижней (или оставьте пустой)." }, { status: 400 });
  }

  // Cost: owner-only input. Anyone else creating a tier (a manager with
  // canEditTariffs) gets it pre-filled from the current global margin
  // default — same convention as a new TariffSettings row carrying the
  // margin forward — so a non-owner never accidentally sets cost to 0.
  let cost: number;
  if (session.role === "owner" && costPerKgUsd !== undefined) {
    const parsedCost = Number(costPerKgUsd);
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      return Response.json({ error: "Себестоимость должна быть неотрицательным числом." }, { status: 400 });
    }
    cost = parsedCost;
  } else {
    const tariffSettings = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
    const defaultMargin = tariffSettings ? Number(tariffSettings.cargoDensityMarginUsdPerKg) : 1.2;
    cost = Math.max(0, rate - defaultMargin);
  }

  const tier = await prisma.densityTariff.create({
    data: {
      categoryKey: categoryKey.trim(),
      categoryLabel: categoryLabel.trim(),
      minDensity: min,
      maxDensity: max,
      ratePerKgUsd: rate,
      costPerKgUsd: cost,
    },
  });

  let responseTier: typeof tier | Omit<typeof tier, "costPerKgUsd"> = tier;
  if (session.role !== "owner") {
    const { costPerKgUsd: strippedCost, ...rest } = tier;
    void strippedCost;
    responseTier = rest;
  }
  return Response.json({ tier: responseTier }, { status: 201 });
}
