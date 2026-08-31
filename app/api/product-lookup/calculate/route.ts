import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { computeProductLookupEstimate, type ProductLookupInput } from "@/lib/desk-services/product-lookup-estimate";
import { DESTINATION_COUNTRIES } from "@/lib/destination-countries";

function parseInput(body: unknown): ProductLookupInput | string {
  const b = (body as Record<string, unknown>) ?? {};
  if (!DESTINATION_COUNTRIES.some((c) => c.value === b.destinationCountry)) return "Укажите страну назначения.";
  if (b.quoteType !== "standard" && b.quoteType !== "expert" && b.quoteType !== "pro") return "Укажите тариф услуги поиска.";
  if (typeof b.cargoCategoryKey !== "string" || !b.cargoCategoryKey) return "Укажите категорию груза.";
  if (b.deliveryPricingMode !== "density" && b.deliveryPricingMode !== "volume") return "Укажите режим расчёта карго.";

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
    quantity: nums.quantity,
    priceCnyPerUnit: nums.priceCnyPerUnit,
    chinaDeliveryCny: nums.chinaDeliveryCny,
    weightPerUnitKg: nums.weightPerUnitKg,
    unitLengthCm: nums.unitLengthCm,
    unitWidthCm: nums.unitWidthCm,
    unitHeightCm: nums.unitHeightCm,
  };
}

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

  try {
    const result = await computeProductLookupEstimate(input);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось посчитать." }, { status: 400 });
  }
}
