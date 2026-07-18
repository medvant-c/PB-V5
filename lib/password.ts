import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// scrypt from Node's built-in crypto module — no bcrypt/argon2 dependency
// needed for a single client-portal password field.
const KEY_LENGTH = 64;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const hashBuffer = Buffer.from(hash, "hex");
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  return candidate.length === hashBuffer.length && timingSafeEqual(candidate, hashBuffer);
}

export { hashPassword, verifyPassword };
