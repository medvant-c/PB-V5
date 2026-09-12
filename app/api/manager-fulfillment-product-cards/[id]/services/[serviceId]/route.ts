import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerClient } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string; serviceId: string }>;
}

async function loadServiceWithAccess(session: Awaited<ReturnType<typeof getManagerSessionFromRequest>>, id: string, serviceId: string) {
  const service = await prisma.fulfillmentProductCardService.findUnique({
    where: { id: serviceId },
    include: { card: { select: { id: true, client: { select: { id: true, createdByManagerId: true } } } } },
  });
  if (!service || service.cardId !== id) {
    return { error: Response.json({ error: "Услуга не найдена." }, { status: 404 }) } as const;
  }
  if (!session || !(await canAccessManagerClient(session, service.card.client))) {
    return { error: Response.json({ error: "Этот клиент вне вашей зоны видимости." }, { status: 403 }) } as const;
  }
  return { service } as const;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  const { id, serviceId } = await params;
  const result = await loadServiceWithAccess(session, id, serviceId);
  if ("error" in result) return result.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { name, priceCny } = (body as { name?: unknown; priceCny?: unknown }) ?? {};
  const data: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) data.name = name.trim();
  if (priceCny !== undefined) {
    const priceCnyNum = Number(priceCny);
    if (!Number.isFinite(priceCnyNum) || priceCnyNum < 0) {
      return Response.json({ error: "Укажите цену, ¥." }, { status: 400 });
    }
    const tariff = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
    const rate = tariff ? Number(tariff.cnyRateRub) : 0;
    data.priceCny = priceCnyNum;
    data.priceRub = priceCnyNum * rate;
  }

  const service = await prisma.fulfillmentProductCardService.update({ where: { id: serviceId }, data });
  return Response.json({ service });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  const { id, serviceId } = await params;
  const result = await loadServiceWithAccess(session, id, serviceId);
  if ("error" in result) return result.error;

  await prisma.fulfillmentProductCardService.delete({ where: { id: serviceId } });
  return Response.json({ ok: true });
}
