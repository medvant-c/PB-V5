import "server-only";
import { SignJWT, jwtVerify } from "jose";

// Short-lived signed JWTs for manager "set your password" links (activation
// and reset) — same principle as lib/account-tokens.ts, but signed with its
// own secret rather than reusing MANAGER_SESSION_SECRET, so a leaked
// activation/reset link can never be replayed as a session token or vice
// versa (belt-and-suspenders beyond the "purpose" claim alone).
type ManagerTokenPurpose = "activate" | "reset";

const EXPIRY_BY_PURPOSE: Record<ManagerTokenPurpose, string> = {
  activate: "7d",
  reset: "1h",
};

function getSecretKey() {
  const secret = process.env.MANAGER_TOKEN_SECRET;
  if (!secret) {
    throw new Error("MANAGER_TOKEN_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

async function createManagerToken(managerId: string, purpose: ManagerTokenPurpose): Promise<string> {
  return new SignJWT({ purpose, managerId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRY_BY_PURPOSE[purpose])
    .sign(getSecretKey());
}

async function verifyManagerToken(token: string): Promise<{ managerId: string; purpose: ManagerTokenPurpose } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      (payload.purpose !== "activate" && payload.purpose !== "reset") ||
      typeof payload.managerId !== "string"
    ) {
      return null;
    }
    return { managerId: payload.managerId, purpose: payload.purpose };
  } catch {
    return null;
  }
}

export { createManagerToken, verifyManagerToken };
export type { ManagerTokenPurpose };
