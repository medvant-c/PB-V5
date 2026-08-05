import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Anyone with access to the quote can actualize cargo (unlike buyout facts)
// — the price comes straight out of the already-frozen cargoRateUsd, not a
// number the manager types in from nowhere, so there's no self-report/
// conflict-of-interest risk to gate against.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote || quote.deletedAt) {
    return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  }
  if (!(await canAccessManagerQuote(session, quote.managerId))) {
    return Response.json({ error: "Нет доступа к этому просчёту." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const {
    actualTotalWeightKg,
    actualTotalVolumeM3,
    packagingCostRub,
    insuranceCostRub,
    mskExpensesRub,
    actualCargoCostRateUsd,
    actualCargoCostBasis,
  } = (body as {
    actualTotalWeightKg?: unknown;
    actualTotalVolumeM3?: unknown;
    packagingCostRub?: unknown;
    insuranceCostRub?: unknown;
    mskExpensesRub?: unknown;
    actualCargoCostRateUsd?: unknown;
    actualCargoCostBasis?: unknown;
  }) ?? {};
  const weightKg = Number(actualTotalWeightKg);
  const volumeM3 = Number(actualTotalVolumeM3);
  if (!Number.isFinite(weightKg) || weightKg <= 0 || !Number.isFinite(volumeM3) || volumeM3 <= 0) {
    return Response.json({ error: "Укажите реальный вес и объём." }, { status: 400 });
  }
  // Optional — a shipment doesn't always have all three. Blank/omitted
  // means "unchanged" would be surprising here (unlike a partial edit
  // elsewhere) since this whole route only ever fires once per real
  // shipment event; missing means 0, not "leave whatever was there."
  function parseNonNegativeOrZero(value: unknown, label: string): number | { error: string } {
    if (value === undefined || value === null || value === "") return 0;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return { error: `«${label}» должно быть неотрицательным числом.` };
    return n;
  }
  const packagingCostResult = parseNonNegativeOrZero(packagingCostRub, "Стоимость упаковки");
  if (typeof packagingCostResult === "object") return Response.json(packagingCostResult, { status: 400 });
  const insuranceCostResult = parseNonNegativeOrZero(insuranceCostRub, "Страховка");
  if (typeof insuranceCostResult === "object") return Response.json(insuranceCostResult, { status: 400 });
  const mskExpensesResult = parseNonNegativeOrZero(mskExpensesRub, "Расходы МСК");
  if (typeof mskExpensesResult === "object") return Response.json(mskExpensesResult, { status: 400 });
  const newPackagingCostRub = packagingCostResult;
  const newInsuranceCostRub = insuranceCostResult;
  const newMskExpensesRub = mskExpensesResult;

  // Real cargo PURCHASE rate — owner-only, same confidentiality boundary as
  // cargoCostRub itself (see its schema comment). Optional: blank/omitted
  // means "keep whatever was there before" (a previously entered real rate
  // stays in effect across a later re-actualization that only corrects
  // weight/volume, same "тот же тариф" reapply convention costPerUnit below
  // already follows) — falling all the way back to the tariff-margin
  // estimate only if no real rate has EVER been entered for this quote.
  // Anyone else submitting these two fields is rejected outright rather
  // than silently ignored, so a manager never gets a false "saved"
  // impression for a field that didn't actually take effect.
  let actualCargoCostRateUsdNum: number | null =
    quote.actualCargoCostRateUsd !== null ? Number(quote.actualCargoCostRateUsd) : null;
  let actualCargoCostBasisValue: "density" | "volume" | null = quote.actualCargoCostBasis;
  const hasCostRateInput = actualCargoCostRateUsd !== undefined && actualCargoCostRateUsd !== null && actualCargoCostRateUsd !== "";
  const hasCostBasisInput = actualCargoCostBasis !== undefined && actualCargoCostBasis !== null && actualCargoCostBasis !== "";
  if (hasCostRateInput || hasCostBasisInput) {
    if (session.role !== "owner") {
      return Response.json({ error: "Реальную ставку закупки карго может внести только руководитель." }, { status: 403 });
    }
    const rateNum = Number(actualCargoCostRateUsd);
    if (!Number.isFinite(rateNum) || rateNum < 0) {
      return Response.json({ error: "Укажите реальную ставку закупки карго неотрицательным числом." }, { status: 400 });
    }
    if (actualCargoCostBasis !== "density" && actualCargoCostBasis !== "volume") {
      return Response.json({ error: "Укажите тип отправки для реальной ставки закупки (по кг или по объёму)." }, { status: 400 });
    }
    actualCargoCostRateUsdNum = rateNum;
    actualCargoCostBasisValue = actualCargoCostBasis;
  }

  const isFirstActualization = quote.estimatedTotalWeightKg === null;

  // Effective per-unit rate/cost margin backed out of the already-frozen
  // numbers instead of re-fetching DensityTariff/VolumeTariff — the same
  // "тот же тариф, та же скидка" rate this quote was always going to use,
  // just re-applied to the real weight/volume instead of the estimate.
  // Baseline MUST come from the ORIGINAL quoted numbers (estimated* once
  // they exist), not from quote.totalWeightKg/cargoCostUsd — those already
  // hold a PREVIOUS actualization's numbers on a re-edit, and deriving the
  // basis/margin from them a second time would compound the wrong answer.
  const baselineWeightKg = isFirstActualization ? Number(quote.totalWeightKg) : Number(quote.estimatedTotalWeightKg);
  const baselineVolumeM3 = isFirstActualization ? Number(quote.totalVolumeM3) : Number(quote.estimatedTotalVolumeM3);
  const baselineDensityKgM3 = isFirstActualization ? Number(quote.densityKgM3) : Number(quote.estimatedDensityKgM3);
  const baselineCargoCostUsd = isFirstActualization ? Number(quote.cargoCostUsd) : Number(quote.estimatedCargoCostUsd);

  // deliveryPricingMode alone isn't enough: computeQuote() in
  // lib/quote-engine.ts falls back to volume-basis pricing below
  // LOW_DENSITY_VOLUME_THRESHOLD_KG_M3 (100 kg/m³) even in "density" mode,
  // and that fallback isn't stored anywhere separately — replicate the
  // exact same rule here off the ORIGINAL density, or cargoRateUsd would
  // get multiplied against the wrong quantity.
  const basisIsDensity = quote.deliveryPricingMode === "density" && baselineDensityKgM3 >= 100;
  const oldBasisQuantity = basisIsDensity ? baselineWeightKg : baselineVolumeM3;
  const newBasisQuantity = basisIsDensity ? weightKg : volumeM3;
  const costPerUnit = oldBasisQuantity > 0 ? baselineCargoCostUsd / oldBasisQuantity : 0;
  const cargoRateUsd = Number(quote.cargoRateUsd);
  const cargoDiscountUsd = Number(quote.cargoDiscountUsd);
  const usdRateUsed = Number(quote.usdRateUsed);

  const rawCargoDeliveryUsd = cargoRateUsd * newBasisQuantity;
  const cargoDeliveryUsd = Math.max(0, rawCargoDeliveryUsd - cargoDiscountUsd);
  const cargoDeliveryRub = cargoDeliveryUsd * usdRateUsed;
  // Real carrier invoice, once entered, replaces the tariff-margin estimate
  // entirely — on ITS OWN basis (по кг vs по объёму), independent of
  // basisIsDensity above (that's the CLIENT-facing sell basis, unrelated).
  const effectiveCostBasisQuantity =
    actualCargoCostRateUsdNum !== null ? (actualCargoCostBasisValue === "density" ? weightKg : volumeM3) : newBasisQuantity;
  const cargoCostUsd = actualCargoCostRateUsdNum !== null ? actualCargoCostRateUsdNum * effectiveCostBasisQuantity : costPerUnit * newBasisQuantity;
  const cargoCostRub = cargoCostUsd * usdRateUsed;
  const densityKgM3 = volumeM3 > 0 ? weightKg / volumeM3 : 0;
  // Old extra-costs values default to 0 on a first actualization (schema
  // default) — this delta swap is a no-op then, same as re-actualizing
  // with the same numbers twice.
  const oldExtraCostsRub = Number(quote.packagingCostRub) + Number(quote.insuranceCostRub) + Number(quote.mskExpensesRub);
  const newExtraCostsRub = newPackagingCostRub + newInsuranceCostRub + newMskExpensesRub;
  const totalRub =
    Number(quote.totalRub) - Number(quote.cargoDeliveryRub) + cargoDeliveryRub - oldExtraCostsRub + newExtraCostsRub;

  const updated = await prisma.quote.update({
    where: { id },
    data: {
      actualTotalWeightKg: weightKg,
      actualTotalVolumeM3: volumeM3,
      ...(isFirstActualization
        ? {
            estimatedTotalWeightKg: quote.totalWeightKg,
            estimatedTotalVolumeM3: quote.totalVolumeM3,
            estimatedDensityKgM3: quote.densityKgM3,
            estimatedCargoDeliveryUsd: quote.cargoDeliveryUsd,
            estimatedCargoDeliveryRub: quote.cargoDeliveryRub,
            estimatedCargoCostUsd: quote.cargoCostUsd,
            estimatedCargoCostRub: quote.cargoCostRub,
            estimatedTotalRub: quote.totalRub,
          }
        : {}),
      cargoActualizedAt: new Date(),
      cargoActualizedByManagerId: session.managerId,
      totalWeightKg: weightKg,
      totalVolumeM3: volumeM3,
      densityKgM3,
      cargoDeliveryUsd,
      cargoDeliveryRub,
      cargoCostUsd,
      cargoCostRub,
      packagingCostRub: newPackagingCostRub,
      insuranceCostRub: newInsuranceCostRub,
      mskExpensesRub: newMskExpensesRub,
      actualCargoCostRateUsd: actualCargoCostRateUsdNum,
      actualCargoCostBasis: actualCargoCostBasisValue,
      totalRub,
    },
    select: {
      id: true,
      totalWeightKg: true,
      totalVolumeM3: true,
      densityKgM3: true,
      cargoDeliveryUsd: true,
      cargoDeliveryRub: true,
      packagingCostRub: true,
      insuranceCostRub: true,
      mskExpensesRub: true,
      actualCargoCostRateUsd: true,
      actualCargoCostBasis: true,
      totalRub: true,
      estimatedTotalRub: true,
      cargoActualizedAt: true,
    },
  });

  return Response.json({ quote: updated });
}
