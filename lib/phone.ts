// Canonical client-phone shape across every entry point that writes
// Client.phone (manager cabinet, the older shared-password /desk tool, and
// client self-registration) — needed so the field can actually be filtered
// and exported later, instead of holding whatever a manager happened to
// type. Every real client so far is Russia/Kazakhstan (+7); there's no
// country-code picker anywhere in the UI, so this deliberately only
// supports that one shape. See PB-V5 chat 2026-07-30.

// Pulls out the 10 significant digits (i.e. without the leading 7/8
// country/trunk digit) from anything a user might type or paste — spaces,
// parens, dashes, a leading + or 8, all just noise to strip. Caps at 10 so
// pasting something longer than a real number doesn't overflow the mask.
function extractSignificantDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const withoutLeadingCountryDigit = digits.length === 11 && (digits[0] === "7" || digits[0] === "8") ? digits.slice(1) : digits;
  return withoutLeadingCountryDigit.slice(0, 10);
}

// Live-typing mask — formats however many significant digits have been
// typed so far into "+7 (XXX) XXX-XX-XX", growing as the user types more.
// Use as a controlled <Input>'s value in every onChange handler that
// collects a client's phone.
function formatPhoneMask(raw: string): string {
  const digits = extractSignificantDigits(raw);
  if (!digits) return "";
  let result = `+7 (${digits.slice(0, 3)}`;
  if (digits.length >= 3) result += ")";
  if (digits.length > 3) result += ` ${digits.slice(3, 6)}`;
  if (digits.length > 6) result += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) result += `-${digits.slice(8, 10)}`;
  return result;
}

// Server-side / backfill normalization — same shape, but returns null
// instead of a partial string when there aren't exactly 10 significant
// digits, so a caller can tell "not a valid phone" apart from "a phone"
// and decide whether to reject or just leave the value untouched (see
// prisma/normalize-phones.ts for existing junk like "тест3").
function normalizePhone(raw: string): string | null {
  const digits = extractSignificantDigits(raw);
  if (digits.length !== 10) return null;
  return `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
}

export { formatPhoneMask, normalizePhone };
