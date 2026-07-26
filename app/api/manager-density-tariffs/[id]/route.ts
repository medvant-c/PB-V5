import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canEditTariffs } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Was missing entirely — a wrong density tier previously had to be "fixed"
// by adding a corrected one and leaving the wrong row in place forever.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (!(await canEditTariffs(session))) {
    return Response.json({ error: "У вас нет прав на изменение тарифов." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.densityTariff.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Тариф не найден." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { categoryLabel, minDensity, maxDensity, ratePerKgUsd, costPerKgUsd } =
    (body as {
      categoryLabel?: unknown;
      minDensity?: unknown;
      maxDensity?: unknown;
      ratePerKgUsd?: unknown;
      costPerKgUsd?: unknown;
    }) ?? {};

  const data: Record<string, unknown> = {};
  if (typeof categoryLabel === "string" && categoryLabel.trim()) data.categoryLabel = categoryLabel.trim();
  if (minDensity !== undefined) {
    const min = Number(minDensity);
    if (!Number.isFinite(min) || min < 0) return Response.json({ error: "Некорректная нижняя граница." }, { status: 400 });
    data.minDensity = min;
  }
  if (maxDensity !== undefined) {
    data.maxDensity = maxDensity === null || maxDensity === "" ? null : Number(maxDensity);
  }
  if (ratePerKgUsd !== undefined) {
    const rate = Number(ratePerKgUsd);
    if (!Number.isFinite(rate) || rate < 0) return Response.json({ error: "Некорректная ставка." }, { status: 400 });
    data.ratePerKgUsd = rate;
  }
  // Cost is stricter than the rest of this route: owner-only, even though a
  // senior with canEditTariffs can reach this far and edit the rate above.
  if (costPerKgUsd !== undefined) {
    if (session.role !== "owner") {
      return Response.json({ error: "Себестоимость может менять только руководитель." }, { status: 403 });
    }
    const cost = Number(costPerKgUsd);
    if (!Number.isFinite(cost) || cost < 0) {
      return Response.json({ error: "Некорректная себестоимость." }, { status: 400 });
    }
    data.costPerKgUsd = cost;
  }

  const tier = await prisma.densityTariff.update({ where: { id }, data });
  let responseTier: typeof tier | Omit<typeof tier, "costPerKgUsd"> = tier;
  if (session.role !== "owner") {
    const { costPerKgUsd: strippedCost, ...rest } = tier;
    void strippedCost;
    responseTier = rest;
  }
  return Response.json({ tier: responseTier });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (!(await canEditTariffs(session))) {
    return Response.json({ error: "У вас нет прав на изменение тарифов." }, { status: 403 });
  }

  const { id } = await params;
  await prisma.densityTariff.delete({ where: { id } }).catch(() => null);
  return Response.json({ ok: true });
}
