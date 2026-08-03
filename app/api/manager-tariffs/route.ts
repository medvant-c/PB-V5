import { NextRequest } from "next/server";
import { getManagerSessionFromRequest, type ManagerSession } from "@/lib/manager-auth";
import { canEditTariffs } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { parseLocaleNumber } from "@/lib/number";

// Cargo margin AND the CNY profit-per-yuan tiers are both owner-confidential
// — a manager needs the sell rate (cnyRateRub*) to price a quote, never the
// profit baked into it, so these fields never leave the server for anyone
// else's session. Shared by GET and POST (the POST response echoes back the
// created row the same way GET reads it — forgetting to strip it there
// would leak the margin the moment a non-owner with canEditTariffs saves
// the form).
function stripMarginForNonOwner<
  T extends {
    cargoDensityMarginUsdPerKg: unknown;
    cargoVolumeMarginUsdPerCbm: unknown;
    cnyProfitPerYuanRub: unknown;
    cnyProfitPerYuanRubTier3000: unknown;
    cnyProfitPerYuanRubTier10000: unknown;
    cnyProfitPerYuanRubTier30000: unknown;
  },
>(
  settings: T,
  session: ManagerSession,
): T | Omit<
  T,
  | "cargoDensityMarginUsdPerKg"
  | "cargoVolumeMarginUsdPerCbm"
  | "cnyProfitPerYuanRub"
  | "cnyProfitPerYuanRubTier3000"
  | "cnyProfitPerYuanRubTier10000"
  | "cnyProfitPerYuanRubTier30000"
> {
  if (session.role === "owner") return settings;
  const {
    cargoDensityMarginUsdPerKg,
    cargoVolumeMarginUsdPerCbm,
    cnyProfitPerYuanRub,
    cnyProfitPerYuanRubTier3000,
    cnyProfitPerYuanRubTier10000,
    cnyProfitPerYuanRubTier30000,
    ...publicSettings
  } = settings;
  void cargoDensityMarginUsdPerKg;
  void cargoVolumeMarginUsdPerCbm;
  void cnyProfitPerYuanRub;
  void cnyProfitPerYuanRubTier3000;
  void cnyProfitPerYuanRubTier10000;
  void cnyProfitPerYuanRubTier30000;
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

  return Response.json({
    settings: stripMarginForNonOwner(settings, session),
    canEdit: await canEditTariffs(session),
    // Whether THIS session can confirm TariffSettings.usdtRateCny — same
    // owner/senior gate as confirm-usd-rate/route.ts's per-quote
    // equivalent (narrower than canEditTariffs, which any flagged manager
    // can have). See app/api/manager-tariffs/confirm-usdt-rate/route.ts.
    canConfirmUsdtRate: session.role === "owner" || session.role === "senior",
  });
}

// parseLocaleNumber, not raw Number() — these fields switched to
// type="text" inputMode="decimal" (see components/manager/tabs/tariffs-tab.tsx)
// specifically because native type="number" inputs silently reject a
// comma decimal separator on some keyboards/browsers, so a comma-typed
// value must still parse correctly once it reaches the server.
function toPositiveNumber(value: unknown): number | null {
  const num = typeof value === "string" ? parseLocaleNumber(value) : value;
  return typeof num === "number" && Number.isFinite(num) && num >= 0 ? num : null;
}

// Every TariffSettings numeric column is required by the schema (never
// null), but this route now accepts a PARTIAL body — the Настройки area
// splits these fields across several sub-tabs (Тарифы, Карго), each with
// its own independent save button, and TariffSettings is one append-only
// row covering all of them. A field not present in this particular POST
// carries forward unchanged from the previous row (same convention the
// owner-only margin/tier fields below already used); only a field that's
// present AND invalid is rejected. See PB-V5 chat 2026-07-31.
const REQUIRED_NUMBER_FIELDS = [
  "cnyRateRub",
  "usdRateRub",
  "volumeRateUsdPerCbm",
  "standardPriceRub",
  "expertPriceRub",
  "proPriceRub",
  "customProductionStandardRub",
  "customProductionExpertRub",
  "customProductionProRub",
  "managerCargoRateUsdPerKg",
  "managerCargoRateUsdPerM3",
] as const;

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
  const previous = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });

  const validated: Record<string, number> = {};
  for (const key of REQUIRED_NUMBER_FIELDS) {
    if (raw[key] !== undefined) {
      const value = toPositiveNumber(raw[key]);
      if (value === null) {
        return Response.json({ error: `Поле «${key}» должно быть неотрицательным числом.` }, { status: 400 });
      }
      validated[key] = value;
    } else if (previous && previous[key as keyof typeof previous] !== null && previous[key as keyof typeof previous] !== undefined) {
      validated[key] = Number(previous[key as keyof typeof previous]);
    } else {
      return Response.json({ error: `Поле «${key}» обязательно при первом сохранении тарифов.` }, { status: 400 });
    }
  }

  // Cargo margin: owner-only. TariffSettings is append-only (every save
  // creates a whole new row), so a save that doesn't send these — either a
  // non-owner, or an owner saving from a different sub-tab — must carry
  // the current margin forward unchanged rather than let it silently reset
  // to the schema default.
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

  // Курсовая разница margin per ¥ — owner-only, same carry-forward-unless-
  // owner-sends-it rule as cargo margin above. Independent of the
  // cnyRateRubTier* fields below (those are what the CLIENT is charged;
  // these are pure internal profit accounting — see
  // lib/desk-services/quote-profit.ts). Sending an explicit null/""
  // clears a tier back to "unset" (0 contribution from that bracket).
  const cnyProfitOverrides: {
    cnyProfitPerYuanRub: number | null;
    cnyProfitPerYuanRubTier3000: number | null;
    cnyProfitPerYuanRubTier10000: number | null;
    cnyProfitPerYuanRubTier30000: number | null;
  } = {
    cnyProfitPerYuanRub: previous?.cnyProfitPerYuanRub !== null && previous?.cnyProfitPerYuanRub !== undefined ? Number(previous.cnyProfitPerYuanRub) : null,
    cnyProfitPerYuanRubTier3000:
      previous?.cnyProfitPerYuanRubTier3000 !== null && previous?.cnyProfitPerYuanRubTier3000 !== undefined
        ? Number(previous.cnyProfitPerYuanRubTier3000)
        : null,
    cnyProfitPerYuanRubTier10000:
      previous?.cnyProfitPerYuanRubTier10000 !== null && previous?.cnyProfitPerYuanRubTier10000 !== undefined
        ? Number(previous.cnyProfitPerYuanRubTier10000)
        : null,
    cnyProfitPerYuanRubTier30000:
      previous?.cnyProfitPerYuanRubTier30000 !== null && previous?.cnyProfitPerYuanRubTier30000 !== undefined
        ? Number(previous.cnyProfitPerYuanRubTier30000)
        : null,
  };
  if (session.role === "owner") {
    for (const key of [
      "cnyProfitPerYuanRub",
      "cnyProfitPerYuanRubTier3000",
      "cnyProfitPerYuanRubTier10000",
      "cnyProfitPerYuanRubTier30000",
    ] as const) {
      const value = raw[key];
      if (value === undefined) continue;
      if (value === null || value === "") {
        cnyProfitOverrides[key] = null;
        continue;
      }
      const parsed = toPositiveNumber(value);
      if (parsed === null) {
        return Response.json({ error: `Поле «${key}» должно быть неотрицательным числом.` }, { status: 400 });
      }
      cnyProfitOverrides[key] = parsed;
    }
  }

  // Volume tiers above "от 1000¥": usually set automatically by the
  // Telegram webhook (app/api/telegram-cny-rate-webhook/route.ts), not
  // through this form. Only touched here when the request actually sends
  // a value for that field (manual edit from Тарифы) — otherwise carried
  // forward from the previous row, same convention as cargo margin above,
  // so a plain "save tariffs" never wipes out the last Telegram-applied
  // tiers. Sending an explicit null/"" clears a tier back to "unset"
  // (falls back to the base rate for that quote).
  const tierOverrides: { cnyRateRubTier3000: number | null; cnyRateRubTier10000: number | null; cnyRateRubTier30000: number | null } = {
    cnyRateRubTier3000: previous?.cnyRateRubTier3000 !== null && previous?.cnyRateRubTier3000 !== undefined ? Number(previous.cnyRateRubTier3000) : null,
    cnyRateRubTier10000: previous?.cnyRateRubTier10000 !== null && previous?.cnyRateRubTier10000 !== undefined ? Number(previous.cnyRateRubTier10000) : null,
    cnyRateRubTier30000: previous?.cnyRateRubTier30000 !== null && previous?.cnyRateRubTier30000 !== undefined ? Number(previous.cnyRateRubTier30000) : null,
  };
  for (const key of ["cnyRateRubTier3000", "cnyRateRubTier10000", "cnyRateRubTier30000"] as const) {
    const value = raw[key];
    if (value === undefined) continue;
    if (value === null || value === "") {
      tierOverrides[key] = null;
      continue;
    }
    const parsed = toPositiveNumber(value);
    if (parsed === null) {
      return Response.json({ error: `Поле «${key}» должно быть неотрицательным числом.` }, { status: 400 });
    }
    tierOverrides[key] = parsed;
  }

  // "1 USDT = X¥" cost-basis rate for the "Счёт на выкуп" USDT option —
  // owner/senior-only (canEditTariffs, checked above), entered manually
  // after each real cash-out deal (no reliable live source — see
  // prisma/schema.prisma). Carries forward unchanged like every other
  // Тарифы field when this save doesn't touch it; when it DOES change,
  // usdtRateCnyConfirmed resets to false — same "value changed → needs
  // fresh sign-off" rule as Quote.usdRateOverrideConfirmed — so a regular
  // manager is blocked from issuing a USDT invoice until it's reconfirmed
  // (see app/api/manager-tariffs/confirm-usdt-rate/route.ts and
  // app/api/manager-quotes/[id]/buyout-invoice/route.ts).
  let usdtRateCny = previous?.usdtRateCny !== null && previous?.usdtRateCny !== undefined ? Number(previous.usdtRateCny) : null;
  let usdtRateCnyConfirmed = previous?.usdtRateCnyConfirmed ?? false;
  let usdtRateCnyConfirmedByManagerId = previous?.usdtRateCnyConfirmedByManagerId ?? null;
  let usdtRateCnyConfirmedAt = previous?.usdtRateCnyConfirmedAt ?? null;
  if (raw.usdtRateCny !== undefined) {
    if (raw.usdtRateCny === null || raw.usdtRateCny === "") {
      usdtRateCny = null;
    } else {
      const parsed = toPositiveNumber(raw.usdtRateCny);
      if (parsed === null) {
        return Response.json({ error: "Поле «Курс USDT» должно быть неотрицательным числом." }, { status: 400 });
      }
      usdtRateCny = parsed;
    }
    if (usdtRateCny !== (previous?.usdtRateCny !== null && previous?.usdtRateCny !== undefined ? Number(previous.usdtRateCny) : null)) {
      usdtRateCnyConfirmed = false;
      usdtRateCnyConfirmedByManagerId = null;
      usdtRateCnyConfirmedAt = null;
    }
  }

  const settings = await prisma.tariffSettings.create({
    data: {
      cnyRateRub: validated.cnyRateRub,
      cnyRateRubTier3000: tierOverrides.cnyRateRubTier3000,
      cnyRateRubTier10000: tierOverrides.cnyRateRubTier10000,
      cnyRateRubTier30000: tierOverrides.cnyRateRubTier30000,
      usdtRateCny,
      usdtRateCnyConfirmed,
      usdtRateCnyConfirmedByManagerId,
      usdtRateCnyConfirmedAt,
      usdRateRub: validated.usdRateRub,
      volumeRateUsdPerCbm: validated.volumeRateUsdPerCbm,
      standardPriceRub: validated.standardPriceRub,
      expertPriceRub: validated.expertPriceRub,
      proPriceRub: validated.proPriceRub,
      customProductionStandardRub: validated.customProductionStandardRub,
      customProductionExpertRub: validated.customProductionExpertRub,
      customProductionProRub: validated.customProductionProRub,
      managerCargoRateUsdPerKg: validated.managerCargoRateUsdPerKg,
      managerCargoRateUsdPerM3: validated.managerCargoRateUsdPerM3,
      cargoDensityMarginUsdPerKg,
      cargoVolumeMarginUsdPerCbm,
      cnyProfitPerYuanRub: cnyProfitOverrides.cnyProfitPerYuanRub,
      cnyProfitPerYuanRubTier3000: cnyProfitOverrides.cnyProfitPerYuanRubTier3000,
      cnyProfitPerYuanRubTier10000: cnyProfitOverrides.cnyProfitPerYuanRubTier10000,
      cnyProfitPerYuanRubTier30000: cnyProfitOverrides.cnyProfitPerYuanRubTier30000,
      createdByManagerId: session.managerId,
    },
  });

  return Response.json({ settings: stripMarginForNonOwner(settings, session) }, { status: 201 });
}
