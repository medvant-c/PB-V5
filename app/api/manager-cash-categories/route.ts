import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

// Owner-only, no exceptions — this whole ledger is the owner's private cash
// book, unlike tariffs/price-list which senior/manager can at least read.
function requireOwner(session: { role: string } | null) {
  return session !== null && session.role === "owner";
}

export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!requireOwner(session)) {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  const type = req.nextUrl.searchParams.get("type");
  const categories = await prisma.cashCategory.findMany({
    where: type === "income" || type === "expense" ? { type } : {},
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  return Response.json({ categories });
}

export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!requireOwner(session)) {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { type, name } = (body as { type?: unknown; name?: unknown }) ?? {};
  if (type !== "income" && type !== "expense") {
    return Response.json({ error: "Некорректный тип статьи." }, { status: 400 });
  }
  if (typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "Укажите название статьи." }, { status: 400 });
  }

  const existing = await prisma.cashCategory.findUnique({ where: { type_name: { type, name: name.trim() } } });
  if (existing) {
    return Response.json({ error: "Такая статья уже существует." }, { status: 409 });
  }

  const category = await prisma.cashCategory.create({ data: { type, name: name.trim() } });
  return Response.json({ category }, { status: 201 });
}
