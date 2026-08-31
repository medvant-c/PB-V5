import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { computeProductLookupEstimate, type ProductLookupInput } from "@/lib/desk-services/product-lookup-estimate";
import { renderQuotePdf } from "@/lib/desk-services/quote-pdf";
import { storage } from "@/lib/storage";
import { DESTINATION_COUNTRIES } from "@/lib/destination-countries";

function parseInput(body: unknown): (ProductLookupInput & { productName: string; photoStorageKey: string | null }) | string {
  const b = (body as Record<string, unknown>) ?? {};
  if (!DESTINATION_COUNTRIES.some((c) => c.value === b.destinationCountry)) return "Укажите страну назначения.";
  if (b.quoteType !== "standard" && b.quoteType !== "expert" && b.quoteType !== "pro") return "Укажите тариф услуги поиска.";
  if (typeof b.cargoCategoryKey !== "string" || !b.cargoCategoryKey) return "Укажите категорию груза.";
  if (b.deliveryPricingMode !== "density" && b.deliveryPricingMode !== "volume") return "Укажите режим расчёта карго.";
  if (typeof b.productName !== "string" || !b.productName.trim()) return "Укажите название товара.";

  const nums: Record<string, number> = {};
  for (const key of ["quantity", "priceCnyPerUnit", "chinaDeliveryCny", "weightPerUnitKg", "unitLengthCm", "unitWidthCm", "unitHeightCm"]) {
    const value = Number(b[key]);
    if (!Number.isFinite(value) || value < 0) return `Некорректное значение поля «${key}».`;
    nums[key] = value;
  }
  if (nums.quantity <= 0) return "Количество должно быть больше нуля.";

  return {
    destinationCountry: b.destinationCountry as ProductLookupInput["destinationCountry"],
    quoteType: b.quoteType,
    cargoCategoryKey: b.cargoCategoryKey,
    deliveryPricingMode: b.deliveryPricingMode,
    productName: b.productName.trim(),
    photoStorageKey: typeof b.photoStorageKey === "string" && b.photoStorageKey ? b.photoStorageKey : null,
    quantity: nums.quantity,
    priceCnyPerUnit: nums.priceCnyPerUnit,
    chinaDeliveryCny: nums.chinaDeliveryCny,
    weightPerUnitKg: nums.weightPerUnitKg,
    unitLengthCm: nums.unitLengthCm,
    unitWidthCm: nums.unitWidthCm,
    unitHeightCm: nums.unitHeightCm,
  };
}

// Собирает файл в ТОМ ЖЕ формате, что и обычный клиентский просчёт
// (lib/desk-services/quote-pdf.tsx), без создания реального Quote — эта
// прикидка ни к какому клиенту не привязана. renderQuotePdf() полностью не
// завязан на БД (см. план «Автопоиск товаров», PB-V5 chat 2026-08-31),
// поэтому сюда просто подставляется заглушка вместо client.
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

  const input = parseInput(body);
  if (typeof input === "string") {
    return Response.json({ error: input }, { status: 400 });
  }

  let estimate;
  try {
    estimate = await computeProductLookupEstimate(input);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось посчитать." }, { status: 400 });
  }

  // Best-effort — истёкшее/отсутствующее фото не должно ронять экспорт,
  // просто в PDF не будет картинки.
  let photoBuffers: Buffer[] = [];
  if (input.photoStorageKey) {
    try {
      photoBuffers = [await storage.get(input.photoStorageKey)];
    } catch {
      photoBuffers = [];
    }
  }

  const { computed } = estimate;
  const pdfBuffer = await renderQuotePdf({
    quote: {
      displayId: 0,
      productName: input.productName,
      productDescription: null,
      color: null,
      dimensions: `${input.unitLengthCm}×${input.unitWidthCm}×${input.unitHeightCm} см`,
      quantity: input.quantity,
      quoteType: input.quoteType,
      priceCnyPerUnit: input.priceCnyPerUnit,
      totalPriceCny: computed.totalPriceCny,
      totalPriceRub: computed.totalPriceRub,
      chinaDeliveryRub: computed.chinaDeliveryRub,
      totalWeightKg: computed.totalWeightKg,
      totalVolumeM3: computed.totalVolumeM3,
      densityKgM3: computed.densityKgM3,
      cargoDeliveryUsd: computed.cargoDeliveryUsd,
      cargoDeliveryRub: computed.cargoDeliveryRub,
      searchServiceFeeRub: estimate.searchServiceFeeRub,
      searchFeeWaived: false,
      isCustomProduction: false,
      customProductionFeeRub: 0,
      buyoutCommissionPercent: computed.buyoutCommissionPercent,
      buyoutCommissionRub: computed.buyoutCommissionRub,
      isCargoOnly: false,
      packagingCostRub: 0,
      insuranceCostRub: 0,
      mskExpensesRub: 0,
      totalRub: computed.totalRub,
      createdAt: new Date().toISOString(),
    },
    client: {
      name: "Предварительный расчёт (автопоиск, без привязки к клиенту)",
      company: null,
      phone: null,
      messenger: null,
    },
    photoBuffers,
    attachedServices: [],
  });

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="avtopoisk-${Date.now()}.pdf"`,
    },
  });
}
