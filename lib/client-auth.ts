import "server-only";
import type { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";

// Session for the client portal ("Личный кабинет") at /account — unlike
// /desk's single shared password, this is per-client: the token carries a
// real clientId, so callers know *whose* data to scope a query to, not just
// "someone is logged in".
const COOKIE_NAME = "client_session";
// Casual "check my order status" use, not a sensitive admin tool like /desk
// (12h) — a much longer session is the right tradeoff here.
const SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60;

function getSecretKey() {
  const secret = process.env.CLIENT_SESSION_SECRET;
  if (!secret) {
    throw new Error("CLIENT_SESSION_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

async function createClientSessionToken(clientId: string): Promise<string> {
  return new SignJWT({ scope: "client", clientId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

async function verifyClientSessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.scope !== "client" || typeof payload.clientId !== "string") return null;
    return payload.clientId;
  } catch {
    return null;
  }
}

// Shared check for API route handlers guarding client-only endpoints —
// returns the logged-in client's id (not just a boolean) since every
// account-facing query needs to be scoped to that specific client.
async function getClientIdFromRequest(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyClientSessionToken(token);
}

export {
  COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  createClientSessionToken,
  verifyClientSessionToken,
  getClientIdFromRequest,
};
