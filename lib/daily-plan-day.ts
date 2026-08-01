// Calendar-day math shared by every daily-plan endpoint. A plain
// "YYYY-MM-DD" (query param or <input type="date">) is always treated as a
// UTC calendar day — same convention as CashOrder.date elsewhere in this
// app — not the browser's local midnight.
function dayBoundsUtc(dateParam: string | null): { start: Date; end: Date } {
  const base = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? new Date(`${dateParam}T00:00:00.000Z`) : new Date();
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// Carry-over (see dailyPlanCarryOver below) only ever applies to the real
// current day — reviewing an arbitrary past date (DailyPlanReviewModal's
// "yesterday" check, an owner scrubbing back through manager-daily-plan-
// summary) must stay an exact historical record.
function isTodayUtc(start: Date): boolean {
  return start.getTime() === dayBoundsUtc(null).start.getTime();
}

export { dayBoundsUtc, isTodayUtc };
