import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { nextContainerShipmentDisplayId } from "@/lib/display-ids";
import { CONTAINER_TYPES, type ContainerType } from "@/lib/container-types";

// Batches several of a client's already-priced quotes into one rail
// container shipment — a completely separate pricing view from each
// quote's own cargo delivery (see ContainerShipment in prisma/schema.prisma
// for the full reasoning). Any manager can form one; the real cost field is
// silently dropped for anyone but the owner, same confidentiality boundary
// as Quote.cargoCostUsd.
export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const { clientId, containerType, totalDeliveryUsd, totalDeliveryCostUsd, quoteIds } =
    (body as {
      clientId?: unknown;
      containerType?: unknown;
      totalDeliveryUsd?: unknown;
      totalDeliveryCostUsd?: unknown;
      quoteIds?: unknown;
    }) ?? {};

  if (typeof clientId !== "string" || !clientId) {
    return Response.json({ error: "Не выбран клиент." }, { status: 400 });
  }
  if (!CONTAINER_TYPES.some((c) => c.value === containerType)) {
    return Response.json({ error: "Выберите тип контейнера." }, { status: 400 });
  }
  const deliveryUsd = Number(totalDeliveryUsd);
  if (!Number.isFinite(deliveryUsd) || deliveryUsd <= 0) {
    return Response.json({ error: "Укажите цену доставки контейнера в $." }, { status: 400 });
  }
  if (!Array.isArray(quoteIds) || quoteIds.length === 0 || !quoteIds.every((id) => typeof id === "string")) {
    return Response.json({ error: "Выберите хотя бы один просчёт." }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return Response.json({ error: "Клиент не найден." }, { status: 404 });

  const visibleManagerIds = await getVisibleManagerIds(session);
  if (
    visibleManagerIds !== "all" &&
    (!client.createdByManagerId || !visibleManagerIds.includes(client.createdByManagerId))
  ) {
    return Response.json({ error: "Этот клиент вне вашей зоны видимости." }, { status: 403 });
  }

  const quotes = await prisma.quote.findMany({ where: { id: { in: quoteIds as string[] }, deletedAt: null } });
  if (quotes.length !== quoteIds.length) {
    return Response.json({ error: "Некоторые просчёты не найдены." }, { status: 400 });
  }
  if (quotes.some((q) => q.clientId !== clientId)) {
    return Response.json({ error: "Все просчёты должны принадлежать одному клиенту." }, { status: 400 });
  }
  if (visibleManagerIds !== "all" && quotes.some((q) => !visibleManagerIds.includes(q.managerId))) {
    return Response.json({ error: "Некоторые просчёты вне вашей зоны видимости." }, { status: 403 });
  }

  const totalVolumeM3Sum = quotes.reduce((sum, q) => sum + Number(q.totalVolumeM3), 0);
  if (totalVolumeM3Sum <= 0) {
    return Response.json(
      { error: "У выбранных просчётов не заполнен объём — расчёт по контейнеру невозможен." },
      { status: 400 },
    );
  }

  // Real cost: owner-only input, same confidentiality boundary as
  // Quote.cargoCostUsd — silently ignored (not an error) if a plain
  // manager's request happens to include it, since the dialog itself
  // already hides the field from anyone but the owner.
  let costUsd: number | null = null;
  if (session.role === "owner" && totalDeliveryCostUsd !== undefined && totalDeliveryCostUsd !== null) {
    const parsedCost = Number(totalDeliveryCostUsd);
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      return Response.json({ error: "Себестоимость должна быть неотрицательным числом." }, { status: 400 });
    }
    costUsd = parsedCost;
  }

  const tariffSettings = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
  if (!tariffSettings) {
    return Response.json({ error: "Тарифы не заданы — заполните вкладку «Тарифы»." }, { status: 400 });
  }

  const shipment = await prisma.containerShipment.create({
    data: {
      displayId: await nextContainerShipmentDisplayId(),
      clientId,
      managerId: session.managerId,
      containerType: containerType as ContainerType,
      totalDeliveryUsd: deliveryUsd,
      totalDeliveryCostUsd: costUsd,
      usdRateRub: Number(tariffSettings.usdRateRub),
      items: {
        create: quotes.map((q) => ({
          quoteId: q.id,
          productName: q.productName,
          color: q.color,
          dimensions: q.dimensions,
          quantity: q.quantity,
          totalWeightKg: q.totalWeightKg,
          totalVolumeM3: q.totalVolumeM3,
          goodsAndFeesRub: Number(q.totalRub) - Number(q.cargoDeliveryRub),
        })),
      },
    },
    select: { id: true, displayId: true },
  });

  return Response.json({ containerShipment: shipment }, { status: 201 });
}
