import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewCash } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.cashCategory.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Статья не найдена." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { name, payoutTarget, linkedInvestorId } = (body as {
    name?: unknown;
    payoutTarget?: unknown;
    linkedInvestorId?: unknown;
  }) ?? {};

  const data: {
    name?: string;
    payoutTarget?: "investor" | "assigned_manager" | null;
    linkedInvestorId?: string | null;
  } = {};

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return Response.json({ error: "Укажите название статьи." }, { status: 400 });
    }
    const trimmed = name.trim();
    if (trimmed !== existing.name) {
      const conflict = await prisma.cashCategory.findUnique({ where: { type_name: { type: existing.type, name: trimmed } } });
      if (conflict) {
        return Response.json({ error: "Такая статья уже существует." }, { status: 409 });
      }
    }
    data.name = trimmed;
  }

  // Who this expense статья's amount auto-suggests for (see
  // CashCategory.payoutTarget in prisma/schema.prisma) — income categories
  // never get a payout target, there's no "amount owed" concept for money
  // coming in.
  if (payoutTarget !== undefined) {
    if (payoutTarget === null) {
      data.payoutTarget = null;
      data.linkedInvestorId = null;
    } else if (payoutTarget === "assigned_manager") {
      if (existing.type !== "expense") {
        return Response.json({ error: "Привязка к получателю доступна только для статей расхода." }, { status: 400 });
      }
      data.payoutTarget = "assigned_manager";
      data.linkedInvestorId = null;
    } else if (payoutTarget === "investor") {
      if (existing.type !== "expense") {
        return Response.json({ error: "Привязка к получателю доступна только для статей расхода." }, { status: 400 });
      }
      if (typeof linkedInvestorId !== "string" || !linkedInvestorId) {
        return Response.json({ error: "Выберите инвестора." }, { status: 400 });
      }
      const investor = await prisma.investor.findUnique({ where: { id: linkedInvestorId } });
      if (!investor) return Response.json({ error: "Инвестор не найден." }, { status: 404 });
      data.payoutTarget = "investor";
      data.linkedInvestorId = linkedInvestorId;
    } else {
      return Response.json({ error: "Некорректная привязка статьи." }, { status: 400 });
    }
  }

  const category = await prisma.cashCategory.update({
    where: { id },
    data,
    include: { linkedInvestor: { select: { id: true, name: true } } },
  });
  return Response.json({ category });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.cashCategory.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Статья не найдена." }, { status: 404 });

  const ordersCount = await prisma.cashOrder.count({ where: { categoryId: id } });
  if (ordersCount > 0) {
    return Response.json({ error: "Нельзя удалить статью, у неё есть операции." }, { status: 409 });
  }

  await prisma.cashCategory.delete({ where: { id } });
  return Response.json({ ok: true });
}
