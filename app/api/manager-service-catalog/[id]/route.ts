import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canManagePriceList } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Gated by Manager.canViewPriceList (owner always has it) — editing the
// price list is a bigger, more visible business decision than day-to-day
// tariff upkeep (canEditTariffs), so it's its own separate grant. See
// lib/manager-scope.ts.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canManagePriceList(session))) {
    return Response.json({ error: "Нет доступа к прайс-листу." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.serviceCatalogItem.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Услуга не найдена." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { name, price } = (body as { name?: unknown; price?: unknown }) ?? {};

  const data: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) data.name = name.trim();
  if (typeof price === "string" && price.trim()) data.price = price.trim();

  const item = await prisma.serviceCatalogItem.update({ where: { id }, data });
  return Response.json({ item });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canManagePriceList(session))) {
    return Response.json({ error: "Нет доступа к прайс-листу." }, { status: 403 });
  }

  const { id } = await params;
  await prisma.serviceCatalogItem.delete({ where: { id } }).catch(() => null);
  return Response.json({ ok: true });
}
