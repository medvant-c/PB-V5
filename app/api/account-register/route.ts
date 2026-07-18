import { NextRequest } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { hashPassword } from "@/lib/password";
import { COOKIE_NAME, SESSION_DURATION_SECONDS, createClientSessionToken } from "@/lib/client-auth";
import { buildSessionCookieHeader, getClientIp } from "@/lib/request-utils";
import { prisma } from "@/lib/prisma";
import { nextClientDisplayId } from "@/lib/display-ids";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`account-register:${ip}`, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS)) {
    return Response.json({ error: "Слишком много попыток. Подождите немного и попробуйте снова." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const { name, email, phone, password } =
    (body as { name?: unknown; email?: unknown; phone?: unknown; password?: unknown }) ?? {};

  if (typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "Укажите имя." }, { status: 400 });
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return Response.json({ error: "Укажите корректный email." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return Response.json({ error: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.` }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = hashPassword(password);

  const existing = await prisma.client.findUnique({ where: { email: normalizedEmail } });

  let clientId: string;
  if (existing) {
    // A manager may have already created this client (e.g. from a call or a
    // messenger chat) before the client ever registers themselves — in that
    // case this registration "claims" that existing record instead of
    // failing, so their orders aren't orphaned under a duplicate account.
    if (existing.passwordHash) {
      return Response.json(
        { error: "Аккаунт с таким email уже зарегистрирован. Войдите или восстановите пароль." },
        { status: 409 },
      );
    }
    const updated = await prisma.client.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        name: name.trim(),
        phone: typeof phone === "string" && phone.trim() ? phone.trim() : existing.phone,
      },
    });
    clientId = updated.id;
  } else {
    const created = await prisma.client.create({
      data: {
        displayId: await nextClientDisplayId(),
        name: name.trim(),
        email: normalizedEmail,
        phone: typeof phone === "string" && phone.trim() ? phone.trim() : null,
        passwordHash,
      },
    });
    clientId = created.id;
  }

  const token = await createClientSessionToken(clientId);
  const response = Response.json({ ok: true });
  response.headers.set("Set-Cookie", buildSessionCookieHeader(req, COOKIE_NAME, token, SESSION_DURATION_SECONDS));
  return response;
}
