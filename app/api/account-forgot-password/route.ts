import { NextRequest } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { createAccountToken } from "@/lib/account-tokens";
import { sendPasswordResetEmail } from "@/lib/account-email";
import { getClientIp } from "@/lib/request-utils";
import { getAppOrigin } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;

const GENERIC_MESSAGE = "Если этот email зарегистрирован, мы отправили на него ссылку для сброса пароля.";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`account-forgot-password:${ip}`, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS)) {
    return Response.json({ error: "Слишком много попыток. Подождите немного и попробуйте снова." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const { email } = (body as { email?: unknown }) ?? {};
  // Same response regardless of whether the email is registered — never
  // leak which emails have accounts.
  if (typeof email !== "string" || !email.trim()) {
    return Response.json({ ok: true, message: GENERIC_MESSAGE });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const client = await prisma.client.findUnique({ where: { email: normalizedEmail } });
  if (client) {
    const token = await createAccountToken(client.id, "reset");
    const origin = getAppOrigin(req);
    // client.email is now nullable in the schema (email is optional at
    // creation), but this row was found BY that exact email, so it can't
    // be null here — using the already-validated local string satisfies
    // the type checker without an unsound assertion.
    await sendPasswordResetEmail(normalizedEmail, `${origin}/account/activate?token=${token}`);
  }

  return Response.json({ ok: true, message: GENERIC_MESSAGE });
}
