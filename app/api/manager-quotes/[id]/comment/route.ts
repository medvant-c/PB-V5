import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_COMMENT_LENGTH = 2000;

// Deliberately separate from PATCH /api/manager-quotes/[id] — that route
// re-runs the full pricing/tariff pipeline on every save, which a comment
// has nothing to do with. Only ever writes managerComment: the client's own
// comment is read-only from this side (each party owns their own line).
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const quote = await prisma.quote.findUnique({ where: { id }, select: { managerId: true } });
  if (!quote || !(await canAccessManagerQuote(session, quote.managerId))) {
    return Response.json({ error: "Нет доступа к этому просчёту." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { comment } = (body as { comment?: unknown }) ?? {};
  if (typeof comment !== "string" || comment.length > MAX_COMMENT_LENGTH) {
    return Response.json({ error: "Некорректный комментарий." }, { status: 400 });
  }

  const updated = await prisma.quote.update({
    where: { id },
    data: { managerComment: comment.trim() },
    select: { managerComment: true },
  });

  return Response.json({ managerComment: updated.managerComment });
}
