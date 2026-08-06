import "server-only";
import type { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import type { ManagerRole } from "@/generated/prisma/enums";

// Session for the manager cabinet at /desk/manager — a real per-person
// account (unlike /desk's single shared password in lib/desk-auth.ts),
// because KPI/bonus data has to be attributable to a specific manager. The
// role travels inside the token so route handlers can gate owner-only pages
// without an extra DB round trip; Manager.active is still re-checked live
// wherever a hard revoke matters (mirrors how Client.active is checked at
// every /account load, not just at login).
const COOKIE_NAME = "manager_session";
// A staff tool used all day, every workday — same duration as /desk's own
// shared session, not the 30-day casual-checkup duration /account uses.
const SESSION_DURATION_SECONDS = 12 * 60 * 60;

function getSecretKey() {
  const secret = process.env.MANAGER_SESSION_SECRET;
  if (!secret) {
    throw new Error("MANAGER_SESSION_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

// impersonatedBy: set only when the owner opened this session via "Войти
// как сотрудник" (see app/api/managers/[id]/impersonate) — carries the
// owner's own managerId so the "Вернуться к своей учётке" flow can hand
// them straight back their own session without a password, and so the
// workspace UI knows to show the "you're viewing as X" banner at all.
async function createManagerSessionToken(managerId: string, role: ManagerRole, impersonatedBy?: string): Promise<string> {
  return new SignJWT({ scope: "manager", managerId, role, ...(impersonatedBy ? { impersonatedBy } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

interface ManagerSession {
  managerId: string;
  role: ManagerRole;
  impersonatedBy?: string;
}

async function verifyManagerSessionToken(token: string): Promise<ManagerSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.scope !== "manager" || typeof payload.managerId !== "string") return null;
    if (
      payload.role !== "manager" &&
      payload.role !== "owner" &&
      payload.role !== "senior" &&
      payload.role !== "outsource_manager"
    )
      return null;
    const impersonatedBy = typeof payload.impersonatedBy === "string" ? payload.impersonatedBy : undefined;
    return { managerId: payload.managerId, role: payload.role, ...(impersonatedBy ? { impersonatedBy } : {}) };
  } catch {
    return null;
  }
}

// Shared check for API route handlers guarding manager-cabinet endpoints —
// returns the session (id + role), not just a boolean, since every query
// needs to be scoped to that specific manager (or, for an owner, allowed to
// span all of them).
async function getManagerSessionFromRequest(req: NextRequest): Promise<ManagerSession | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyManagerSessionToken(token);
}

export {
  COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  createManagerSessionToken,
  verifyManagerSessionToken,
  getManagerSessionFromRequest,
};
export type { ManagerSession };
