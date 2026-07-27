import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

function requireOwner(session: { role: string } | null) {
  return session !== null && session.role === "owner";
}

// Single-row anchor — GET returns it (or null if never set), PUT always
// upserts the same row rather than creating a history of anchors.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!requireOwner(session)) {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  const balance = await prisma.cashOpeningBalance.findFirst({ orderBy: { updatedAt: "desc" } });
  return Response.json({ balance });
}

export async function PUT(req: NextRequest) {
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
  const { effectiveDate, amountCny } = (body as { effectiveDate?: unknown; amountCny?: unknown }) ?? {};
  const parsedDate = typeof effectiveDate === "string" ? new Date(effectiveDate) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return Response.json({ error: "Укажите дату." }, { status: 400 });
  }
  const amount = Number(amountCny);
  if (!Number.isFinite(amount)) {
    return Response.json({ error: "Укажите сумму." }, { status: 400 });
  }

  const existing = await prisma.cashOpeningBalance.findFirst({ orderBy: { updatedAt: "desc" } });
  const balance = existing
    ? await prisma.cashOpeningBalance.update({
        where: { id: existing.id },
        data: { effectiveDate: parsedDate, amountCny: amount, updatedByManagerId: session!.managerId },
      })
    : await prisma.cashOpeningBalance.create({
        data: { effectiveDate: parsedDate, amountCny: amount, updatedByManagerId: session!.managerId },
      });

  return Response.json({ balance });
}
