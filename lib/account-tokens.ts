import "server-only";
import { SignJWT, jwtVerify } from "jose";

// Short-lived signed JWTs for "set your password" links (account activation
// and password reset) — no separate token table in the DB, same principle as
// the session cookie in lib/client-auth.ts. Reuses CLIENT_SESSION_SECRET:
// the "purpose" claim plus differing expiry already keep these tokens
// non-interchangeable with a session token (verifyClientSessionToken checks
// scope: "client", this checks purpose), so a second env var isn't needed.
type AccountTokenPurpose = "activate" | "reset";

const EXPIRY_BY_PURPOSE: Record<AccountTokenPurpose, string> = {
  activate: "7d",
  reset: "1h",
};

function getSecretKey() {
  const secret = process.env.CLIENT_SESSION_SECRET;
  if (!secret) {
    throw new Error("CLIENT_SESSION_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

async function createAccountToken(clientId: string, purpose: AccountTokenPurpose): Promise<string> {
  return new SignJWT({ purpose, clientId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRY_BY_PURPOSE[purpose])
    .sign(getSecretKey());
}

async function verifyAccountToken(token: string): Promise<{ clientId: string; purpose: AccountTokenPurpose } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      (payload.purpose !== "activate" && payload.purpose !== "reset") ||
      typeof payload.clientId !== "string"
    ) {
      return null;
    }
    return { clientId: payload.clientId, purpose: payload.purpose };
  } catch {
    return null;
  }
}

export { createAccountToken, verifyAccountToken };
export type { AccountTokenPurpose };
