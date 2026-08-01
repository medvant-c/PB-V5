import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const SHARE_TYPES = new Set(["percent_of_profit", "flat_per_cargo_kg", "remainder_share"]);

function toPositiveNumber(value: unknown): number | null {
  const num = typeof value === "string" ? Number(value) : value;
  return typeof num === "number" && Number.isFinite(num) && num >= 0 ? num : null;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner") {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.investor.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Инвестор не найден." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const raw = (body as Record<string, unknown>) ?? {};

  const data: Record<string, unknown> = {};

  if (raw.name !== undefined) {
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) return Response.json({ error: "Укажите имя." }, { status: 400 });
    data.name = name;
  }

  // shareType can change too — e.g. converting a percent-based investor to
  // a remainder-share one. If it changes without also sending the matching
  // rate field, the now-irrelevant rate is cleared (a percent_of_profit
  // investor switched to remainder_share shouldn't keep a stale
  // ratePercent lying around).
  const nextShareType = typeof raw.shareType === "string" ? raw.shareType : existing.shareType;
  if (raw.shareType !== undefined) {
    if (!SHARE_TYPES.has(nextShareType)) {
      return Response.json({ error: "Некорректный тип доли." }, { status: 400 });
    }
    data.shareType = nextShareType;
  }

  if (raw.ratePercent !== undefined) {
    if (raw.ratePercent === null || raw.ratePercent === "") {
      data.ratePercent = null;
    } else {
      const ratePercent = toPositiveNumber(raw.ratePercent);
      if (ratePercent === null || ratePercent > 100) {
        return Response.json({ error: "Доля должна быть числом от 0 до 100." }, { status: 400 });
      }
      data.ratePercent = ratePercent;
    }
  } else if (raw.shareType !== undefined && nextShareType !== "percent_of_profit") {
    data.ratePercent = null;
  }

  if (raw.rateUsdPerKg !== undefined) {
    if (raw.rateUsdPerKg === null || raw.rateUsdPerKg === "") {
      data.rateUsdPerKg = null;
    } else {
      const rateUsdPerKg = toPositiveNumber(raw.rateUsdPerKg);
      if (rateUsdPerKg === null) {
        return Response.json({ error: "Ставка должна быть неотрицательным числом." }, { status: 400 });
      }
      data.rateUsdPerKg = rateUsdPerKg;
    }
  } else if (raw.shareType !== undefined && nextShareType !== "flat_per_cargo_kg") {
    data.rateUsdPerKg = null;
  }

  if (nextShareType === "percent_of_profit" && (data.ratePercent ?? existing.ratePercent) === null) {
    return Response.json({ error: "Укажите долю в процентах для этого типа." }, { status: 400 });
  }
  if (nextShareType === "flat_per_cargo_kg" && (data.rateUsdPerKg ?? existing.rateUsdPerKg) === null) {
    return Response.json({ error: "Укажите ставку в $/кг для этого типа." }, { status: 400 });
  }

  if (raw.paymentChannel !== undefined) {
    data.paymentChannel = typeof raw.paymentChannel === "string" && raw.paymentChannel.trim() ? raw.paymentChannel.trim() : null;
  }
  if (raw.note !== undefined) {
    data.note = typeof raw.note === "string" && raw.note.trim() ? raw.note.trim() : null;
  }
  if (raw.sortOrder !== undefined) {
    const sortOrder = toPositiveNumber(raw.sortOrder);
    if (sortOrder === null) return Response.json({ error: "Некорректный порядок." }, { status: 400 });
    data.sortOrder = sortOrder;
  }
  if (raw.active !== undefined) {
    data.active = Boolean(raw.active);
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "Нечего обновлять." }, { status: 400 });
  }

  data.updatedByManagerId = session.managerId;
  const investor = await prisma.investor.update({ where: { id }, data });
  return Response.json({ investor });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner") {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  const { id } = await params;
  await prisma.investor.delete({ where: { id } }).catch(() => null);
  return Response.json({ ok: true });
}
