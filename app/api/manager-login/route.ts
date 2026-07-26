import { NextRequest } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { verifyPassword } from "@/lib/password";
import { COOKIE_NAME, SESSION_DURATION_SECONDS, createManagerSessionToken } from "@/lib/manager-auth";
import { buildSessionCookieHeader, getClientIp } from "@/lib/request-utils";
import { prisma } from "@/lib/prisma";

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;

const GENERIC_ERROR = "Неверный email или пароль.";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`manager-login:${ip}`, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_ATTEMPTS)) {
    return Response.json({ error: "Слишком много попыток. Подождите немного и попробуйте снова." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const { email, password } = (body as { email?: unknown; password?: unknown }) ?? {};
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    return Response.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const manager = await prisma.manager.findUnique({ where: { email: normalizedEmail } });
  // Same generic error whether the manager doesn't exist, hasn't activated
  // yet, typed the wrong password, or was deactivated — never leak which.
  if (!manager || !manager.active || !manager.passwordHash || !verifyPassword(password, manager.passwordHash)) {
    return Response.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const token = await createManagerSessionToken(manager.id, manager.role);
  const response = Response.json({ ok: true });
  response.headers.set("Set-Cookie", buildSessionCookieHeader(req, COOKIE_NAME, token, SESSION_DURATION_SECONDS));
  return response;
}
