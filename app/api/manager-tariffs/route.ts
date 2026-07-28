import { NextRequest } from "next/server";
import { getManagerSessionFromRequest, type ManagerSession } from "@/lib/manager-auth";
import { canEditTariffs } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

// Cargo margin is owner-confidential — a manager needs the sell rate to
// price a quote, never the profit baked into it, so these two fields never
// leave the server for anyone else's session. Shared by GET and POST (the
// POST response echoes back the created row the same way GET reads it —
// forgetting to strip it there would leak the margin the moment a non-owner
// with canEditTariffs saves the form).
function stripMarginForNonOwner<T extends { cargoDensityMarginUsdPerKg: unknown; cargoVolumeMarginUsdPerCbm: unknown }>(
  settings: T,
  session: ManagerSession,
): T | Omit<T, "cargoDensityMarginUsdPerKg" | "cargoVolumeMarginUsdPerCbm"> {
  if (session.role === "owner") return settings;
  const { cargoDensityMarginUsdPerKg, cargoVolumeMarginUsdPerCbm, ...publicSettings } = settings;
  void cargoDensityMarginUsdPerKg;
  void cargoVolumeMarginUsdPerCbm;
  return publicSettings;
}

// "Current" tariffs is just the newest row — TariffSettings is append-only
// (see prisma/schema.prisma) so quotes already created keep the numbers
// they were computed with even after a manager updates today's rates.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const settings = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
  if (!settings) {
    return Response.json({ error: "Тарифы ещё не заданы." }, { status: 404 });
  }

  return Response.json({ settings: stripMarginForNonOwner(settings, session), canEdit: await canEditTariffs(session) });
}

function toPositiveNumber(value: unknown): number | null {
  const num = typeof value === "string" ? Number(value) : value;
  return typeof num === "number" && Number.isFinite(num) && num >= 0 ? num : null;
}

export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  if (!(await canEditTariffs(session))) {
    return Response.json({ error: "У вас нет прав на изменение тарифов." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const raw = (body as Record<string, unknown>) ?? {};
  const fields = {
    cnyRateRub: toPositiveNumber(raw.cnyRateRub),
    usdRateRub: toPositiveNumber(raw.usdRateRub),
    volumeRateUsdPerCbm: toPositiveNumber(raw.volumeRateUsdPerCbm),
    buyoutCommissionPercent: toPositiveNumber(raw.buyoutCommissionPercent),
    standardPriceRub: toPositiveNumber(raw.standardPriceRub),
    expertPriceRub: toPositiveNumber(raw.expertPriceRub),
    proPriceRub: toPositiveNumber(raw.proPriceRub),
    managerCargoRateUsdPerKg: toPositiveNumber(raw.managerCargoRateUsdPerKg),
    managerCargoRateUsdPerM3: toPositiveNumber(raw.managerCargoRateUsdPerM3),
  };

  for (const [key, value] of Object.entries(fields)) {
    if (value === null) {
      return Response.json({ error: `Поле «${key}» должно быть неотрицательным числом.` }, { status: 400 });
    }
  }
  const validated = fields as Record<keyof typeof fields, number>;

  // Cargo margin: owner-only. TariffSettings is append-only (every save
  // creates a whole new row), so a non-owner's save — which never even
  // sees these fields in the form — must carry the current margin forward
  // unchanged rather than let it silently reset to the schema default.
  const previous = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
  let cargoDensityMarginUsdPerKg = previous ? Number(previous.cargoDensityMarginUsdPerKg) : 1.2;
  let cargoVolumeMarginUsdPerCbm = previous ? Number(previous.cargoVolumeMarginUsdPerCbm) : 50;
  if (session.role === "owner" && (raw.cargoDensityMarginUsdPerKg !== undefined || raw.cargoVolumeMarginUsdPerCbm !== undefined)) {
    const dm = toPositiveNumber(raw.cargoDensityMarginUsdPerKg);
    const vm = toPositiveNumber(raw.cargoVolumeMarginUsdPerCbm);
    if (dm === null || vm === null) {
      return Response.json({ error: "Маржа по карго должна быть неотрицательным числом." }, { status: 400 });
    }
    cargoDensityMarginUsdPerKg = dm;
    cargoVolumeMarginUsdPerCbm = vm;
  }

  const settings = await prisma.tariffSettings.create({
    data: {
      cnyRateRub: validated.cnyRateRub,
      usdRateRub: validated.usdRateRub,
      volumeRateUsdPerCbm: validated.volumeRateUsdPerCbm,
      buyoutCommissionPercent: validated.buyoutCommissionPercent,
      standardPriceRub: validated.standardPriceRub,
      expertPriceRub: validated.expertPriceRub,
      proPriceRub: validated.proPriceRub,
      managerCargoRateUsdPerKg: validated.managerCargoRateUsdPerKg,
      managerCargoRateUsdPerM3: validated.managerCargoRateUsdPerM3,
      cargoDensityMarginUsdPerKg,
      cargoVolumeMarginUsdPerCbm,
      createdByManagerId: session.managerId,
    },
  });

  return Response.json({ settings: stripMarginForNonOwner(settings, session) }, { status: 201 });
}
