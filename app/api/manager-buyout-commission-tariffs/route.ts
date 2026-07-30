import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canEditTariffs } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

// No category dimension here (unlike DensityTariff/VolumeTariff) — one
// ladder of amount brackets applies to every quote. No owner-confidential
// cost field either — commissionPercent is a plain sell rate, same
// visibility as standardPriceRub etc.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const tiers = await prisma.buyoutCommissionTariff.findMany({ orderBy: { minAmountRub: "asc" } });
  return Response.json({ tiers });
}

// Adds one bracket to the ladder — editing/deleting an existing bracket is
// app/api/manager-buyout-commission-tariffs/[id]/route.ts. Old brackets
// already used by a Quote stay untouched regardless, since Quote snapshots
// the rate it found, not a reference to this row.
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

  const { minAmountRub, maxAmountRub, commissionPercent } =
    (body as { minAmountRub?: unknown; maxAmountRub?: unknown; commissionPercent?: unknown }) ?? {};

  const min = Number(minAmountRub);
  const percent = Number(commissionPercent);
  if (!Number.isFinite(min) || min < 0) {
    return Response.json({ error: "Укажите нижнюю границу суммы закупа." }, { status: 400 });
  }
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return Response.json({ error: "Укажите комиссию в процентах (0–100)." }, { status: 400 });
  }
  const max = maxAmountRub === null || maxAmountRub === undefined || maxAmountRub === "" ? null : Number(maxAmountRub);
  if (max !== null && (!Number.isFinite(max) || max <= min)) {
    return Response.json({ error: "Верхняя граница должна быть больше нижней (или оставьте пустой)." }, { status: 400 });
  }

  const tier = await prisma.buyoutCommissionTariff.create({
    data: { minAmountRub: min, maxAmountRub: max, commissionPercent: percent },
  });

  return Response.json({ tier }, { status: 201 });
}
