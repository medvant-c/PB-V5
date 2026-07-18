import { NextRequest } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { COOKIE_NAME, SESSION_DURATION_SECONDS, createDeskSessionToken } from "@/lib/desk-auth";

// Brute-force guard on the password itself — separate from any per-file
// rate limiting. 8 attempts / 5 minutes per IP.
const LOGIN_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 8;

function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

// The `Secure` cookie attribute is silently dropped by browsers over plain
// HTTP — including local `next start` testing on http://localhost, which
// isn't covered by NODE_ENV alone (a production build still serves plain
// HTTP locally). Only add it when the request itself arrived over HTTPS, so
// local testing keeps working and real (HTTPS) deployments stay secure.
function isHttpsRequest(req: NextRequest): boolean {
  return req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`desk-login:${ip}`, LOGIN_RATE_LIMIT_WINDOW_MS, LOGIN_RATE_LIMIT_MAX_ATTEMPTS)) {
    return Response.json(
      { error: "Слишком много попыток. Подождите немного и попробуйте снова." },
      { status: 429 },
    );
  }

  const deskPassword = process.env.DESK_PASSWORD;
  if (!deskPassword) {
    console.error("DESK_PASSWORD is not set");
    return Response.json({ error: "Рабочий стол временно недоступен." }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const password = (body as { password?: unknown })?.password;
  if (typeof password !== "string" || password !== deskPassword) {
    return Response.json({ error: "Неверный пароль." }, { status: 401 });
  }

  const token = await createDeskSessionToken();
  const secureAttr = isHttpsRequest(req) ? "; Secure" : "";
  const response = Response.json({ ok: true });
  response.headers.set(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; HttpOnly${secureAttr}; SameSite=Lax; Path=/; Max-Age=${SESSION_DURATION_SECONDS}`,
  );
  return response;
}
