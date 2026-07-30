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
  const existing = await prisma.buyoutCommissionTariff.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Тариф не найден." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { minAmountRub, maxAmountRub, commissionPercent } =
    (body as { minAmountRub?: unknown; maxAmountRub?: unknown; commissionPercent?: unknown }) ?? {};

  const data: Record<string, unknown> = {};
  if (minAmountRub !== undefined) {
    const min = Number(minAmountRub);
    if (!Number.isFinite(min) || min < 0) return Response.json({ error: "Некорректная нижняя граница." }, { status: 400 });
    data.minAmountRub = min;
  }
  if (maxAmountRub !== undefined) {
    data.maxAmountRub = maxAmountRub === null || maxAmountRub === "" ? null : Number(maxAmountRub);
  }
  if (commissionPercent !== undefined) {
    const percent = Number(commissionPercent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return Response.json({ error: "Некорректная комиссия." }, { status: 400 });
    }
    data.commissionPercent = percent;
  }

  const tier = await prisma.buyoutCommissionTariff.update({ where: { id }, data });
  return Response.json({ tier });
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
  await prisma.buyoutCommissionTariff.delete({ where: { id } }).catch(() => null);
  return Response.json({ ok: true });
}
