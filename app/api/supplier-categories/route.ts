import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

// «База поставщиков» — общий, коллективно пополняемый справочник, доступен
// любому авторизованному менеджеру без ролевых ограничений (тот же принцип,
// что POST /api/manager-clients — см. app/api/manager-clients/route.ts).
// См. план mellow-forging-kay.md, PB-V5 chat 2026-08-23.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const categories = await prisma.supplierCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { suppliers: true } } },
  });

  return Response.json({
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      emoji: c.emoji,
      sortOrder: c.sortOrder,
      supplierCount: c._count.suppliers,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { name, emoji } = (body as { name?: unknown; emoji?: unknown }) ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "Укажите название категории." }, { status: 400 });
  }

  const existing = await prisma.supplierCategory.findUnique({ where: { name: name.trim() } });
  if (existing) {
    return Response.json({ error: "Такая категория уже есть." }, { status: 409 });
  }

  const last = await prisma.supplierCategory.findFirst({ orderBy: { sortOrder: "desc" } });
  const category = await prisma.supplierCategory.create({
    data: {
      name: name.trim(),
      emoji: typeof emoji === "string" && emoji.trim() ? emoji.trim() : null,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });

  return Response.json({ category }, { status: 201 });
}
