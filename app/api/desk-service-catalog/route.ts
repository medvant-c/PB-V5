import { NextRequest } from "next/server";
import { hasDeskSession } from "@/lib/desk-auth";
import { OrderDirection } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { nextServiceCode } from "@/lib/display-ids";

const VALID_DIRECTIONS = new Set<string>(Object.values(OrderDirection));

export async function GET(req: NextRequest) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const direction = req.nextUrl.searchParams.get("direction");
  if (direction && !VALID_DIRECTIONS.has(direction)) {
    return Response.json({ error: "Некорректное направление." }, { status: 400 });
  }

  const items = await prisma.serviceCatalogItem.findMany({
    where: direction ? { direction: direction as OrderDirection } : undefined,
    orderBy: { name: "asc" },
  });

  return Response.json({ items });
}

export async function POST(req: NextRequest) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
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
