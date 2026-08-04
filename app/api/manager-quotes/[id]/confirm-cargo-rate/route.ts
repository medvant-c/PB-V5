import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { getSystemSettings } from "@/lib/system-settings";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Owner/senior-only sign-off on a manager's manual cargo rate
// (Quote.cargoRateUsdOverride) — the sell rate is already usable the
// moment the manager types it (the client sees a real, final price right
// away), but profit accounting for this quote stays on the generic
// tariff-margin fallback until someone here locks in the REAL supplier
// cost per кг/м³ plus a screenshot proving the rate is real, not guessed.
// Re-confirmable (corrects a mistake) — doesn't require
// cargoRateOverrideConfirmed to still be false. See PB-V5 chat 2026-07-30.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior") {
    return Response.json(
      { error: "Подтвердить ручную ставку карго может только старший менеджер или руководитель." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote || quote.deletedAt) {
    return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  }
  if (quote.cargoRateUsdOverride === null) {
    return Response.json({ error: "У этого просчёта нет ручной ставки карго." }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const cost = Number(formData.get("cargoRateOverrideCostUsd"));
  if (!Number.isFinite(cost) || cost < 0) {
    return Response.json({ error: "Укажите цену закупки за 1 кг/м³ в долларах." }, { status: 400 });
  }

  // Proof screenshot is a nice-to-have, not a hard gate — the owner/senior
  // is already the one clicking "Подтвердить" and typing the real cost, so
  // requiring a file too was one click of friction too many. See PB-V5
  // chat 2026-07-31.
  const file = formData.get("file");
  if (file instanceof File) {
    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: "Файл слишком большой (максимум 8MB)." }, { status: 400 });
    }
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      return Response.json({ error: "Недопустимый тип файла. Разрешены: PNG, JPG, WEBP, GIF." }, { status: 400 });
    }
  }

  // Re-derive which basis (weight vs volume) this quote's cargo actually
  // prices on — same rule computeQuote/flatCargoBonusRub already use;
  // not stored as its own field on Quote.
  const systemSettings = await getSystemSettings(session.managerId);
  const threshold = Number(systemSettings.lowDensityVolumeThresholdKgM3);
  const basisIsDensity = quote.deliveryPricingMode === "density" && Number(quote.densityKgM3) >= threshold;
  const quantityBasis = basisIsDensity ? Number(quote.totalWeightKg) : Number(quote.totalVolumeM3);
  const cargoRateUsd = Number(quote.cargoRateUsd);
  const cargoCostUsd = (cargoRateUsd - cost) * quantityBasis;
  const cargoCostRub = cargoCostUsd * Number(quote.usdRateUsed);

  if (file instanceof File) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storage.upload(buffer, file.name);
    await prisma.deskFile.create({
      data: {
        tab: "quote_cargo_rate_proof",
        relatedId: quote.id,
        storageKey: stored.key,
        originalName: file.name,
        mimeType: file.type,
        size: stored.size,
        uploadedByManagerId: session.managerId,
      },
    });
  }

  const updated = await prisma.quote.update({
    where: { id },
    data: {
      cargoRateOverrideConfirmed: true,
      cargoRateOverrideCostUsd: cost,
      cargoRateOverrideConfirmedByManagerId: session.managerId,
      cargoRateOverrideConfirmedAt: new Date(),
      cargoCostUsd,
      cargoCostRub,
    },
    select: {
      id: true,
      cargoRateOverrideConfirmed: true,
      cargoRateOverrideCostUsd: true,
      cargoRateOverrideConfirmedAt: true,
    },
  });

  return Response.json({ quote: updated });
}
