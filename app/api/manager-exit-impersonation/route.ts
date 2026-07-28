import { NextRequest } from "next/server";
import { getManagerSessionFromRequest, createManagerSessionToken, COOKIE_NAME, SESSION_DURATION_SECONDS } from "@/lib/manager-auth";
import { buildSessionCookieHeader } from "@/lib/request-utils";
import { prisma } from "@/lib/prisma";

// Hands the owner back their own session from inside an impersonated one
// (see .../managers/[id]/impersonate) — re-verifies the original owner
// still exists and is still actually an owner before minting the token,
// rather than trusting the JWT's impersonatedBy claim blindly.
export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !session.impersonatedBy) {
    return Response.json({ error: "Сессия не в режиме имперсонации." }, { status: 400 });
  }

  const owner = await prisma.manager.findUnique({ where: { id: session.impersonatedBy } });
  if (!owner || owner.role !== "owner") {
    return Response.json({ error: "Исходный аккаунт руководителя не найден." }, { status: 403 });
  }

  const token = await createManagerSessionToken(owner.id, owner.role);
  const response = Response.json({ ok: true });
  response.headers.set("Set-Cookie", buildSessionCookieHeader(req, COOKIE_NAME, token, SESSION_DURATION_SECONDS));
  return response;
}
