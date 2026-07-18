import { NextRequest } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { verifyPassword } from "@/lib/password";
import { COOKIE_NAME, SESSION_DURATION_SECONDS, createClientSessionToken } from "@/lib/client-auth";
import {
  COOKIE_NAME as DESK_COOKIE_NAME,
  SESSION_DURATION_SECONDS as DESK_SESSION_DURATION_SECONDS,
  createDeskSessionToken,
} from "@/lib/desk-auth";
import { buildSessionCookieHeader, getClientIp } from "@/lib/request-utils";
import { prisma } from "@/lib/prisma";

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;

const GENERIC_ERROR = "Неверный email или пароль.";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`account-login:${ip}`, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_ATTEMPTS)) {
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

  // The manager can also log in through this same form (as a second entry
  // point to /desk, alongside the quiet footer link) — a separate
  // credential pair, not a Client row, so it's checked before the regular
  // client lookup and routes to a desk_session instead of a client_session.
  const managerEmail = process.env.DESK_MANAGER_EMAIL?.trim().toLowerCase();
  const managerPassword = process.env.DESK_MANAGER_PASSWORD;
  if (managerEmail && managerPassword && normalizedEmail === managerEmail) {
    if (password !== managerPassword) {
      return Response.json({ error: GENERIC_ERROR }, { status: 401 });
    }
    const token = await createDeskSessionToken();
    const response = Response.json({ ok: true, redirect: "/desk" });
    response.headers.set(
      "Set-Cookie",
      buildSessionCookieHeader(req, DESK_COOKIE_NAME, token, DESK_SESSION_DURATION_SECONDS),
    );
    return response;
  }

  const client = await prisma.client.findUnique({ where: { email: normalizedEmail } });
  // Same generic error whether the client doesn't exist, hasn't activated
  // their account yet, typed the wrong password, or was deactivated by a
  // manager — never leak which case.
  if (!client || !client.active || !client.passwordHash || !verifyPassword(password, client.passwordHash)) {
    return Response.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const token = await createClientSessionToken(client.id);
  const response = Response.json({ ok: true });
  response.headers.set("Set-Cookie", buildSessionCookieHeader(req, COOKIE_NAME, token, SESSION_DURATION_SECONDS));
  return response;
}
