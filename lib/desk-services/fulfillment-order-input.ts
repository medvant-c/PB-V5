// Общий парсинг тела запроса на создание/правку заказа фулфилмента —
// раньше был буквально задублирован между POST .../route.ts и PATCH
// .../[id]/route.ts (см. старый комментарий "kept as a literal copy");
// теперь форма body заметно выросла (¥-цены, план/факт кол-во, карточка
// товара, услуги на партию целиком), так что дублирование стало реальным
// риском рассинхрона — вынесено сюда. См. план «Фулфилмент», PB-V5 chat
// 2026-09-11.

interface ParsedServiceInput {
  serviceItemId: string | null;
  name: string;
  priceCny: number;
  quantity: number;
}

interface ParsedItemInput {
  name: string;
  sku: string | null;
  dimensions: string | null;
  plannedQuantity: number;
  productCardId: string | null;
  services: ParsedServiceInput[];
}

interface ParsedOrderServiceInput {
  name: string;
  priceCny: number;
  quantity: number;
}

function parseServices(raw: unknown, itemLabel: string): ParsedServiceInput[] | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: `У товара «${itemLabel}» не выбрано ни одной услуги.` };
  }
  const services: ParsedServiceInput[] = [];
  for (const rawService of raw) {
    const service = rawService as { serviceItemId?: unknown; name?: unknown; priceCny?: unknown; quantity?: unknown };
    const serviceName = typeof service.name === "string" ? service.name.trim() : "";
    const priceCny = Number(service.priceCny);
    const quantity = Number(service.quantity);
    if (!serviceName || !Number.isFinite(priceCny) || priceCny < 0 || !Number.isInteger(quantity) || quantity <= 0) {
      return { error: `Некорректная услуга у товара «${itemLabel}».` };
    }
    services.push({
      serviceItemId: typeof service.serviceItemId === "string" && service.serviceItemId ? service.serviceItemId : null,
      name: serviceName,
      priceCny,
      quantity,
    });
  }
  return services;
}

function parseItems(raw: unknown): ParsedItemInput[] | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "Добавьте хотя бы один товар." };
  }
  const items: ParsedItemInput[] = [];
  for (const rawItem of raw) {
    const item = rawItem as {
      name?: unknown;
      sku?: unknown;
      dimensions?: unknown;
      plannedQuantity?: unknown;
      productCardId?: unknown;
      services?: unknown;
    };
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) return { error: "Укажите название товара." };
    const services = parseServices(item.services, name);
    if ("error" in services) return services;
    const plannedQuantity = item.plannedQuantity === undefined ? 1 : Number(item.plannedQuantity);
    if (!Number.isInteger(plannedQuantity) || plannedQuantity <= 0) {
      return { error: `Укажите плановое количество у товара «${name}».` };
    }
    items.push({
      name,
      sku: typeof item.sku === "string" && item.sku.trim() ? item.sku.trim() : null,
      dimensions: typeof item.dimensions === "string" && item.dimensions.trim() ? item.dimensions.trim() : null,
      plannedQuantity,
      productCardId: typeof item.productCardId === "string" && item.productCardId ? item.productCardId : null,
      services,
    });
  }
  return items;
}

function parseOrderServices(raw: unknown): ParsedOrderServiceInput[] | { error: string } {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return { error: "Некорректный список услуг на партию." };
  const services: ParsedOrderServiceInput[] = [];
  for (const rawService of raw) {
    const service = rawService as { name?: unknown; priceCny?: unknown; quantity?: unknown };
    const name = typeof service.name === "string" ? service.name.trim() : "";
    const priceCny = Number(service.priceCny);
    const quantity = Number(service.quantity);
    if (!name || !Number.isFinite(priceCny) || priceCny < 0 || !Number.isInteger(quantity) || quantity <= 0) {
      return { error: "Некорректная услуга на партию целиком." };
    }
    services.push({ name, priceCny, quantity });
  }
  return services;
}

function itemsTotalRub(items: ParsedItemInput[], cnyRateUsed: number): number {
  return items.reduce(
    (orderSum, item) => orderSum + item.services.reduce((itemSum, s) => itemSum + s.priceCny * cnyRateUsed * s.quantity, 0),
    0,
  );
}

function orderServicesTotalRub(services: ParsedOrderServiceInput[], cnyRateUsed: number): number {
  return services.reduce((sum, s) => sum + s.priceCny * cnyRateUsed * s.quantity, 0);
}

export { parseItems, parseOrderServices, itemsTotalRub, orderServicesTotalRub };
export type { ParsedItemInput, ParsedServiceInput, ParsedOrderServiceInput };
