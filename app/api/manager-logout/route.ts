import { NextRequest } from "next/server";
import { COOKIE_NAME } from "@/lib/manager-auth";
import { isHttpsRequest } from "@/lib/request-utils";

export async function POST(req: NextRequest) {
  const secureAttr = isHttpsRequest(req) ? "; Secure" : "";
  const response = Response.json({ ok: true });
  response.headers.set("Set-Cookie", `${COOKIE_NAME}=; HttpOnly${secureAttr}; SameSite=Lax; Path=/; Max-Age=0`);
  return response;
}
