import { NextRequest } from "next/server";
import { COOKIE_NAME } from "@/lib/desk-auth";

function isHttpsRequest(req: NextRequest): boolean {
  return req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}

export async function POST(req: NextRequest) {
  const secureAttr = isHttpsRequest(req) ? "; Secure" : "";
  const response = Response.json({ ok: true });
  response.headers.set(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly${secureAttr}; SameSite=Lax; Path=/; Max-Age=0`,
  );
  return response;
}
