import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewCash } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Удаление ошибочного перевода — без PATCH: перевод намеренно проще
// обычного ордера (нет статьи/клиента/просчёта), исправление ошибки —
// удалить и завести заново, а не редактировать задним числом. См. PB-V5
// chat 2026-08-08.
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.cashTransfer.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Перевод не найден." }, { status: 404 });

  await prisma.cashTransfer.delete({ where: { id } });
  return Response.json({ ok: true });
}
