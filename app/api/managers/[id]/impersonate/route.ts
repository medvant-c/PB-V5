import { NextRequest } from "next/server";
import { getManagerSessionFromRequest, createManagerSessionToken, COOKIE_NAME, SESSION_DURATION_SECONDS } from "@/lib/manager-auth";
import { buildSessionCookieHeader } from "@/lib/request-utils";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// "Войти как сотрудник" — the secure alternative to the owner knowing
// everyone's actual password (which would require storing them
// recoverably, a real security liability). Opens a session for the target
// manager directly, no password involved, with impersonatedBy set so the
// workspace can show a banner and the owner can get their own session
// back via /api/manager-exit-impersonation without logging in again.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || session.role !== "owner") {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  const { id } = await params;
  if (id === session.managerId) {
    return Response.json({ error: "Нельзя войти как самого себя." }, { status: 400 });
  }
  const target = await prisma.manager.findUnique({ where: { id } });
  if (!target) {
    return Response.json({ error: "Сотрудник не найден." }, { status: 404 });
  }

  const token = await createManagerSessionToken(target.id, target.role, session.managerId);
  const response = Response.json({ ok: true, managerName: target.name });
  response.headers.set("Set-Cookie", buildSessionCookieHeader(req, COOKIE_NAME, token, SESSION_DURATION_SECONDS));
  return response;
}
