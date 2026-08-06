import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewTrash } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Owner always; anyone else needs Manager.canViewTrash explicitly granted.
// Stricter than every other confirm-*/restore-style action in the app
// (those are owner OR senior by role, unconditionally) per an earlier
// explicit instruction that deleting/restoring a quote can undo a
// manager's own mistake (or cover one up) — this override exists because
// the owner is still the one deciding to grant it for a specific trusted
// person, not because that restriction is being relaxed by default. See
// PB-V5 chat 2026-08-04, 2026-08-06.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (!(await canViewTrash(session))) {
    return Response.json({ error: "Восстановить просчёт может только руководитель или уполномоченный сотрудник." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.quote.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  }
  if (!existing.deletedAt) {
    return Response.json({ error: "Этот просчёт не в корзине." }, { status: 400 });
  }

  const quote = await prisma.quote.update({
    where: { id },
    data: { deletedAt: null, deletedByManagerId: null },
  });

  return Response.json({ quote });
}
