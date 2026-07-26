import { NextRequest } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { verifyManagerToken } from "@/lib/manager-tokens";
import { hashPassword } from "@/lib/password";
import { COOKIE_NAME, SESSION_DURATION_SECONDS, createManagerSessionToken } from "@/lib/manager-auth";
import { buildSessionCookieHeader, getClientIp } from "@/lib/request-utils";
import { prisma } from "@/lib/prisma";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const MIN_PASSWORD_LENGTH = 8;

// Serves both activation and password reset — identical outcome once the
// token verifies, same as app/api/account-set-password/route.ts.
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`manager-set-password:${ip}`, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS)) {
    return Response.json({ error: "Слишком много попыток. Подождите немного и попробуйте снова." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const { token, password } = (body as { token?: unknown; password?: unknown }) ?? {};
  if (typeof token !== "string" || !token) {
    return Response.json({ error: "Ссылка недействительна или устарела." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return Response.json({ error: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.` }, { status: 400 });
  }

  const verified = await verifyManagerToken(token);
  if (!verified) {
    return Response.json({ error: "Ссылка недействительна или устарела." }, { status: 400 });
  }

  let manager;
  try {
    manager = await prisma.manager.update({
      where: { id: verified.managerId },
      data: { passwordHash: hashPassword(password) },
    });
  } catch {
    return Response.json({ error: "Ссылка недействительна или устарела." }, { status: 400 });
  }

  const sessionToken = await createManagerSessionToken(manager.id, manager.role);
  const response = Response.json({ ok: true });
  response.headers.set("Set-Cookie", buildSessionCookieHeader(req, COOKIE_NAME, sessionToken, SESSION_DURATION_SECONDS));
  return response;
}
