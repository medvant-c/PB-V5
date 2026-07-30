import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getSystemSettings } from "@/lib/system-settings";
import { prisma } from "@/lib/prisma";

// Read-open to any authenticated manager — none of this is confidential
// (the premium rates are already spelled out in the dashboard's "Как
// считается премия" text every manager sees). Editing is owner-only,
// stricter than the usual canEditTariffs delegation on Тарифы — these
// numbers set the company-wide profit split and every manager's own
// premium rate, not just a routine price update.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const settings = await getSystemSettings();
  return Response.json({ settings, canEdit: session.role === "owner" });
}

function toPositiveNumber(value: unknown): number | null {
  const num = typeof value === "string" ? Number(value) : value;
  return typeof num === "number" && Number.isFinite(num) && num >= 0 ? num : null;
}

function toPercent(value: unknown): number | null {
  const num = toPositiveNumber(value);
  return num !== null && num <= 100 ? num : null;
}

export async function PATCH(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner") {
    return Response.json({ error: "Изменять системные настройки может только руководитель." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const raw = (body as Record<string, unknown>) ?? {};

  const data: Record<string, unknown> = {};

  const percentFields = [
    "normalRatePercent",
    "selfSourcedProscetRatePercent",
    "selfSourcedBuyoutDiscountRatePercent",
    "vladShareRatePercent",
    "fulfillmentPremiumRatePercent",
  ] as const;
  for (const field of percentFields) {
    if (raw[field] === undefined) continue;
    const value = toPercent(raw[field]);
    if (value === null) {
      return Response.json({ error: `Поле «${field}» должно быть числом от 0 до 100.` }, { status: 400 });
    }
    data[field] = value;
  }

  if (raw.freeStandardQuoteLimit !== undefined) {
    const value = toPositiveNumber(raw.freeStandardQuoteLimit);
    if (value === null || !Number.isInteger(value)) {
      return Response.json({ error: "Лимит бесплатных просчётов должен быть целым неотрицательным числом." }, { status: 400 });
    }
    data.freeStandardQuoteLimit = value;
  }

  if (raw.lowDensityVolumeThresholdKgM3 !== undefined) {
    const value = toPositiveNumber(raw.lowDensityVolumeThresholdKgM3);
    if (value === null) {
      return Response.json({ error: "Порог плотности должен быть неотрицательным числом." }, { status: 400 });
    }
    data.lowDensityVolumeThresholdKgM3 = value;
  }

  const textFields = ["premiumExplanationText", "incomeSummaryText", "incomeDetailText"] as const;
  for (const field of textFields) {
    if (raw[field] === undefined) continue;
    if (typeof raw[field] !== "string") {
      return Response.json({ error: `Поле «${field}» должно быть текстом.` }, { status: 400 });
    }
    data[field] = raw[field];
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "Нечего обновлять." }, { status: 400 });
  }

  // Singleton — update the existing row in place (creating it first via
  // getSystemSettings if this is somehow the very first write).
  const existing = await getSystemSettings(session.managerId);
  data.updatedByManagerId = session.managerId;
  const settings = await prisma.systemSettings.update({ where: { id: existing.id }, data });

  return Response.json({ settings });
}
