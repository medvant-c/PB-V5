// Manually-issued access codes for paid Panda AI usage (bypasses the public
// trial limit). Codes are given out by hand after a customer pays — no
// payment gateway or user accounts yet, just a shared allowlist in env.
// Add/revoke a code by editing PANDA_AI_ACCESS_CODES and redeploying.
function getValidCodes(): Set<string> {
  const raw = process.env.PANDA_AI_ACCESS_CODES ?? "";
  return new Set(
    raw
      .split(",")
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean),
  );
}

function isValidAccessCode(code: unknown): boolean {
  if (typeof code !== "string" || !code.trim()) return false;
  return getValidCodes().has(code.trim().toUpperCase());
}

export { isValidAccessCode };
