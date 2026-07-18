import { NextRequest } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { isValidAccessCode } from "@/lib/access-codes";

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;

function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`code-attempt:${ip}`, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS)) {
    return Response.json(
      { valid: false, error: "Слишком много попыток. Подождите немного и попробуйте снова." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ valid: false, error: "Некорректный запрос." }, { status: 400 });
  }

  const code = (body as { code?: unknown })?.code;
  if (typeof code !== "string" || !code.trim()) {
    return Response.json({ valid: false, error: "Введите код доступа." }, { status: 400 });
  }

  return Response.json({ valid: isValidAccessCode(code) });
}
