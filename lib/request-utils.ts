import type { NextRequest } from "next/server";

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

function buildSessionCookieHeader(
  req: NextRequest,
  cookieName: string,
  token: string,
  maxAgeSeconds: number,
): string {
  const secureAttr = isHttpsRequest(req) ? "; Secure" : "";
  return `${cookieName}=${token}; HttpOnly${secureAttr}; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export { getClientIp, isHttpsRequest, buildSessionCookieHeader };
