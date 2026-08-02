import "server-only";
import { OrderDirection } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

// Human-friendly client number ("Клиент №N") shown in the desk UI — computed
// from the current max rather than a plain count so it stays correct even if
// a client is ever deleted (no delete route exists yet, but this way nothing
// has to change if one is added later).
async function nextClientDisplayId(): Promise<number> {
  const last = await prisma.client.findFirst({ orderBy: { displayId: "desc" } });
  return (last?.displayId ?? 0) + 1;
}

// Same max+1 pattern as nextClientDisplayId, for the manager cabinet
// ("Менеджер №N").
async function nextManagerDisplayId(): Promise<number> {
  const last = await prisma.manager.findFirst({ orderBy: { displayId: "desc" } });
  return (last?.displayId ?? 0) + 1;
}

// Same max+1 pattern, for the quote calculator ("Просчёт №N").
async function nextQuoteDisplayId(): Promise<number> {
  const last = await prisma.quote.findFirst({ orderBy: { displayId: "desc" } });
  return (last?.displayId ?? 0) + 1;
}

// Same max+1 pattern, for Фулфилмент orders ("Заказ №N").
async function nextFulfillmentOrderDisplayId(): Promise<number> {
  const last = await prisma.fulfillmentOrder.findFirst({ orderBy: { displayId: "desc" } });
  return (last?.displayId ?? 0) + 1;
}

// Same max+1 pattern, for черновики ("Черновик №N").
async function nextQuoteDraftRequestDisplayId(): Promise<number> {
  const last = await prisma.quoteDraftRequest.findFirst({ orderBy: { displayId: "desc" } });
  return (last?.displayId ?? 0) + 1;
}

// Same max+1 pattern, for ЖД container shipments ("Контейнер №N").
async function nextContainerShipmentDisplayId(): Promise<number> {
  const last = await prisma.containerShipment.findFirst({ orderBy: { displayId: "desc" } });
  return (last?.displayId ?? 0) + 1;
}

// Two-letter prefix per direction for service SKUs, e.g. "ST-014".
const DIRECTION_CODE_PREFIX: Record<OrderDirection, string> = {
  start: "ST",
  business: "BU",
  factory: "FA",
  logistics: "LO",
  fulfillment: "FU",
  ai: "AI",
  academy: "AC",
};

async function nextServiceCode(direction: OrderDirection): Promise<string> {
  const prefix = DIRECTION_CODE_PREFIX[direction];
  const last = await prisma.serviceCatalogItem.findFirst({
    where: { direction, code: { startsWith: `${prefix}-` } },
    orderBy: { code: "desc" },
  });
  const lastSequence = last?.code ? parseInt(last.code.split("-")[1] ?? "0", 10) || 0 : 0;
  return `${prefix}-${String(lastSequence + 1).padStart(3, "0")}`;
}

export {
  nextClientDisplayId,
  nextManagerDisplayId,
  nextQuoteDisplayId,
  nextFulfillmentOrderDisplayId,
  nextQuoteDraftRequestDisplayId,
  nextContainerShipmentDisplayId,
  nextServiceCode,
  DIRECTION_CODE_PREFIX,
};
