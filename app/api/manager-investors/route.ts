import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

const SHARE_TYPES = new Set(["percent_of_profit", "flat_per_cargo_kg", "remainder_share"]);

// Owner-only, same confidentiality boundary as Vlad/Юра/founders always
// had before this was data instead of code — see Investor in
// prisma/schema.prisma. Replaces the fixed SystemSettings fields
// (vladShareRatePercent, yuraCargoRateUsdPerKg) and the hardcoded
// Александр/Антон 50/50 split. See PB-V5 chat 2026-07-31.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner") {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  const investors = await prisma.investor.findMany({ orderBy: { sortOrder: "asc" } });
  return Response.json({ investors });
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
  if (session.role !== "owner") {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const raw = (body as Record<string, unknown>) ?? {};

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return Response.json({ error: "Укажите имя." }, { status: 400 });

  const shareType = typeof raw.shareType === "string" ? raw.shareType : "";
  if (!SHARE_TYPES.has(shareType)) {
    return Response.json({ error: "Некорректный тип доли." }, { status: 400 });
  }

  let ratePercent: number | null = null;
  let rateUsdPerKg: number | null = null;
  if (shareType === "percent_of_profit") {
    ratePercent = toPositiveNumber(raw.ratePercent);
    if (ratePercent === null || ratePercent > 100) {
      return Response.json({ error: "Укажите долю в процентах (0–100)." }, { status: 400 });
    }
  } else if (shareType === "flat_per_cargo_kg") {
    rateUsdPerKg = toPositiveNumber(raw.rateUsdPerKg);
    if (rateUsdPerKg === null) {
      return Response.json({ error: "Укажите ставку в $/кг." }, { status: 400 });
    }
  }
  // remainder_share needs no rate — it always gets an even split of
  // whatever's left, see splitRemainderRub in lib/desk-services/quote-profit.ts.

  const paymentChannel = typeof raw.paymentChannel === "string" && raw.paymentChannel.trim() ? raw.paymentChannel.trim() : null;
  const note = typeof raw.note === "string" && raw.note.trim() ? raw.note.trim() : null;

  const maxSortOrder = await prisma.investor.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (maxSortOrder._max.sortOrder ?? 0) + 1;

  const investor = await prisma.investor.create({
    data: {
      name,
      shareType,
      ratePercent,
      rateUsdPerKg,
      paymentChannel,
      note,
      sortOrder,
      updatedByManagerId: session.managerId,
    },
  });

  return Response.json({ investor }, { status: 201 });
}
