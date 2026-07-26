import { NextRequest } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { createManagerToken } from "@/lib/manager-tokens";
import { sendManagerPasswordResetEmail } from "@/lib/manager-email";
import { getClientIp } from "@/lib/request-utils";
import { getAppOrigin } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;

const GENERIC_MESSAGE = "Если этот email зарегистрирован, мы отправили на него ссылку для сброса пароля.";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`manager-forgot-password:${ip}`, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS)) {
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

  const manager = await prisma.manager.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (manager) {
    const token = await createManagerToken(manager.id, "reset");
    const origin = getAppOrigin(req);
    await sendManagerPasswordResetEmail(manager.email, `${origin}/desk/manager/activate?token=${token}`);
  }

  return Response.json({ ok: true, message: GENERIC_MESSAGE });
}
