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
  if (!quote) {
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
  const { actualTotalWeightKg, actualTotalVolumeM3 } = (body as { actualTotalWeightKg?: unknown; actualTotalVolumeM3?: unknown }) ?? {};
  const weightKg = Number(actualTotalWeightKg);
  const volumeM3 = Number(actualTotalVolumeM3);
  if (!Number.isFinite(weightKg) || weightKg <= 0 || !Number.isFinite(volumeM3) || volumeM3 <= 0) {
    return Response.json({ error: "Укажите реальный вес и объём." }, { status: 400 });
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
  const cargoCostUsd = costPerUnit * newBasisQuantity;
  const cargoCostRub = cargoCostUsd * usdRateUsed;
  const densityKgM3 = volumeM3 > 0 ? weightKg / volumeM3 : 0;
  const totalRub = Number(quote.totalRub) - Number(quote.cargoDeliveryRub) + cargoDeliveryRub;

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
      totalRub,
    },
    select: {
      id: true,
      totalWeightKg: true,
      totalVolumeM3: true,
      densityKgM3: true,
      cargoDeliveryUsd: true,
      cargoDeliveryRub: true,
      totalRub: true,
      estimatedTotalRub: true,
      cargoActualizedAt: true,
    },
  });

  return Response.json({ quote: updated });
}
