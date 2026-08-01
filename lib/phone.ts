// Canonical client-phone shape across every entry point that writes
// Client.phone (manager cabinet, the older shared-password /desk tool, and
// client self-registration) — needed so the field can actually be filtered
// and exported later, instead of holding whatever a manager happened to
// type. Most real clients are Russia/Kazakhstan (+7), which gets the nice
// live-typing mask below — anything else (a Chinese supplier, a client
// abroad) is accepted as-typed once it's clearly a different country code
// (see isInternational below), not force-fit into +7 or rejected outright.
// There's still no per-country validation library here, just this one
// shape the mask actually knows how to format. See PB-V5 chat 2026-07-30,
// revisited 2026-08-01.

// A leading "+" followed by any digit other than 7 — the one unambiguous
// signal that this is a non-RU number without needing a full country-code
// table. A bare local number typed with no "+" at all still falls through
// to the RU mask below, same limitation as before this fix.
function isInternational(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("+")) return false;
  const afterPlus = trimmed.slice(1).replace(/\D/g, "");
  return afterPlus.length > 0 && afterPlus[0] !== "7";
}

// Pulls out the 10 significant digits (i.e. without the leading 7/8
// country/trunk digit) from anything a user might type or paste — spaces,
// parens, dashes, a leading + or 8, all just noise to strip. Caps at 10 so
// pasting something longer than a real number doesn't overflow the mask.
//
// formatPhoneMask below is a controlled <Input> that re-feeds its OWN
// previous render back into this function on every keystroke — so once the
// field is non-empty, `raw` always starts with the mask's literal "+7 ("
// prefix. That prefix's own "7" must never be counted as a digit the user
// typed (it would otherwise get misread as a leading country-code digit,
// corrupting every digit after the first — see PB-V5 chat 2026-07-30), so
// it's stripped by exact prefix match first, before any digit counting.
// The separate length===11 case below still handles a *pasted* complete
// number that carries its own country code (e.g. "+79991234567" typed
// without the mask's spacing, or "89991234567").
function extractSignificantDigits(raw: string): string {
  const withoutOwnPrefix = raw.startsWith("+7 (") ? raw.slice(4) : raw;
  const digits = withoutOwnPrefix.replace(/\D/g, "");
  const withoutLeadingCountryDigit = digits.length === 11 && (digits[0] === "7" || digits[0] === "8") ? digits.slice(1) : digits;
  return withoutLeadingCountryDigit.slice(0, 10);
}

// Live-typing mask — formats however many significant digits have been
// typed so far into "+7 (XXX) XXX-XX-XX", growing as the user types more.
// Use as a controlled <Input>'s value in every onChange handler that
// collects a client's phone, passing the input's own previous value as
// `previous` (needed for the backspace fix below).
//
// `previous` lets backspace actually make progress when the character just
// deleted was punctuation the mask itself drew (a ")", " ", or "-") rather
// than a digit — deleting pure formatting doesn't change the digit count,
// so without this the mask just redraws the same punctuation right back
// and backspace appears to do nothing (see PB-V5 chat 2026-07-30). When the
// string got shorter but the digit count didn't, one extra digit is
// dropped from the end to match the user's actual intent.
function formatPhoneMask(raw: string, previous?: string): string {
  if (isInternational(raw)) {
    // No mask to apply — just keep it phone-safe (digits, +, spaces,
    // parens, dashes) and let the manager type the number as their client
    // gave it to them.
    return raw.replace(/[^\d+\s()-]/g, "");
  }
  let digits = extractSignificantDigits(raw);
  if (previous !== undefined && raw.length < previous.length) {
    const previousDigits = extractSignificantDigits(previous);
    if (digits.length === previousDigits.length && digits.length > 0) {
      digits = digits.slice(0, -1);
    }
  }
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
  if (isInternational(raw)) {
    const trimmed = raw.trim();
    const digitCount = trimmed.replace(/\D/g, "").length;
    // Loose E.164-ish range — enough to catch "clearly not a phone number"
    // typos without pretending to validate any specific country's format.
    if (digitCount < 7 || digitCount > 15) return null;
    return trimmed.replace(/[^\d+\s()-]/g, "").replace(/\s+/g, " ");
  }
  const digits = extractSignificantDigits(raw);
  if (digits.length !== 10) return null;
  return `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
}

export { formatPhoneMask, normalizePhone };
