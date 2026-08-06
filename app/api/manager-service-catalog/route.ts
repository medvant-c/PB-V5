import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canManagePriceList } from "@/lib/manager-scope";
import { OrderDirection } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { nextServiceCode } from "@/lib/display-ids";

const VALID_DIRECTIONS = new Set<string>(Object.values(OrderDirection));

// Read access for the manager cabinet — the existing /api/desk-service-
// catalog is gated by the old shared-password /desk session, which a
// manager-cabinet user never has. Any logged-in manager can read the full
// catalog (needed to attach a service to a quote); creating/editing needs
// Manager.canViewPriceList (owner always has it) — see [id]/route.ts and
// lib/manager-scope.ts.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const items = await prisma.serviceCatalogItem.findMany({
    orderBy: [{ direction: "asc" }, { name: "asc" }],
  });
  return Response.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canManagePriceList(session))) {
    return Response.json({ error: "Нет доступа к прайс-листу." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { direction, name, price } = (body as { direction?: unknown; name?: unknown; price?: unknown }) ?? {};

  if (typeof direction !== "string" || !VALID_DIRECTIONS.has(direction)) {
    return Response.json({ error: "Некорректное направление." }, { status: 400 });
  }
  if (typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "Укажите название услуги." }, { status: 400 });
  }
  if (typeof price !== "string" || !price.trim()) {
    return Response.json({ error: "Укажите цену." }, { status: 400 });
  }

  const item = await prisma.serviceCatalogItem.create({
    data: {
      code: await nextServiceCode(direction as OrderDirection),
      direction: direction as OrderDirection,
      name: name.trim(),
      price: price.trim(),
    },
  });

  return Response.json({ item }, { status: 201 });
}
