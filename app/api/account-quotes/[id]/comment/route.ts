import { NextRequest } from "next/server";
import { getClientIdFromRequest } from "@/lib/client-auth";
import { prisma } from "@/lib/prisma";

const MAX_COMMENT_LENGTH = 2000;

// Client-scoped mirror of /api/manager-quotes/[id]/comment — only ever
// writes clientComment, gated by ownership (clientId) instead of a manager
// session. The manager's own comment is read-only from this side.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const clientId = await getClientIdFromRequest(req);
  if (!clientId) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const quote = await prisma.quote.findFirst({ where: { id, clientId }, select: { id: true } });
  if (!quote) {
    return Response.json({ error: "Просчёт не найден." }, { status: 404 });
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
    data: { clientComment: comment.trim() },
    select: { clientComment: true },
  });

  return Response.json({ clientComment: updated.clientComment });
}
