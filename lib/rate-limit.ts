const requestLog = new Map<string, number[]>();

// Simple in-memory sliding-window limiter, keyed by caller-provided id
// (usually an IP address). Good enough for a single-instance deployment;
// swap for a shared store (Redis, Upstash) if this ever runs multi-instance.
function isRateLimited(key: string, windowMs: number, maxRequests: number): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);

  if (timestamps.length >= maxRequests) {
    requestLog.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  requestLog.set(key, timestamps);
  return false;
}

// Read-only counterpart for callers that need to check a quota before doing
// expensive work, then only commit the usage (via recordRequest) once that
// work actually succeeds — e.g. a trial quota that shouldn't be consumed by
// a request that failed for reasons unrelated to the caller (upstream error).
function peekRateLimited(key: string, windowMs: number, maxRequests: number): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
  requestLog.set(key, timestamps);
  return timestamps.length >= maxRequests;
}

function recordRequest(key: string): void {
  const timestamps = requestLog.get(key) ?? [];
  timestamps.push(Date.now());
  requestLog.set(key, timestamps);
}

export { isRateLimited, peekRateLimited, recordRequest };
