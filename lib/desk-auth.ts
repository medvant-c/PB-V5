import "server-only";
import type { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";

// Session for the internal /desk manager tool — a single shared password,
// not per-user accounts. The signed JWT just proves "someone who knew the
// password logged in before <exp>"; there's no user identity inside it.
const COOKIE_NAME = "desk_session";
const SESSION_DURATION_SECONDS = 12 * 60 * 60; // 12 hours, per spec

function getSecretKey() {
  const secret = process.env.DESK_SESSION_SECRET;
  if (!secret) {
    throw new Error("DESK_SESSION_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

async function createDeskSessionToken(): Promise<string> {
  return new SignJWT({ scope: "desk" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

async function verifyDeskSessionToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload.scope === "desk";
  } catch {
    return false;
  }
}

// Shared check for API route handlers that guard desk file/chat operations
// with the same cookie the /desk page itself checks.
async function hasDeskSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return verifyDeskSessionToken(token);
}

export {
  COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  createDeskSessionToken,
  verifyDeskSessionToken,
  hasDeskSession,
};
