import "server-only";
import { parseLocaleNumber } from "@/lib/number";

interface ParsedCnyRateTiers {
  rateFrom1000: number | null;
  rateFrom3000: number | null;
  rateFrom10000: number | null;
  rateFrom30000: number | null;
}

interface ParsedCnyRateMessage extends ParsedCnyRateTiers {
  error: string | null;
}

// Matches a line like "🔴  от 3000¥      ➡️     12,95 за 1¥" — the arrow/
// emoji between the two numbers varies (➡️, plain "-", nothing), so it's
// swallowed by a non-greedy same-line wildcard rather than matched
// literally. Requires "за 1¥" specifically (not "за 1usdt") so the
// group's separate USDT rate table is never mistaken for a ¥ rate — see
// the real sample message this was built against, PB-V5 chat 2026-07-31.
const TIER_LINE = /от\s*(\d[\d\s ]*)\s*¥[^\n]*?([\d]+[.,]\d+)\s*за\s*1\s*¥/gi;

function parseCnyRateTiers(text: string): ParsedCnyRateTiers {
  const tiers: ParsedCnyRateTiers = {
    rateFrom1000: null,
    rateFrom3000: null,
    rateFrom10000: null,
    rateFrom30000: null,
  };
  for (const match of text.matchAll(TIER_LINE)) {
    const threshold = Number(match[1].replace(/[\s ]/g, ""));
    const rate = parseLocaleNumber(match[2]);
    if (!Number.isFinite(rate)) continue;
    if (threshold === 1000) tiers.rateFrom1000 = rate;
    else if (threshold === 3000) tiers.rateFrom3000 = rate;
    else if (threshold === 10000) tiers.rateFrom10000 = rate;
    else if (threshold === 30000) tiers.rateFrom30000 = rate;
  }
  return tiers;
}

// Returns null (not an error) when `text` plainly isn't a rate post at
// all — most messages in a group chat aren't, and the webhook needs to
// ignore those silently rather than logging an "error" for every random
// message. Anything that DOES look like a rate post but is missing the
// "от 1000¥" tier specifically comes back with `error` set instead — that
// tier is TariffSettings.cnyRateRub, a required field, so a message
// without it can't be applied at all. The other three tiers are each
// optional independently (see TariffSettings.cnyRateRubTier3000 etc.) —
// missing just one of them still updates the rest.
function parseCnyRateMessage(text: string): ParsedCnyRateMessage | null {
  if (!text.includes("Российский рубль") || !text.toLowerCase().includes("за 1¥")) {
    return null;
  }

  const tiers = parseCnyRateTiers(text);
  if (tiers.rateFrom1000 === null) {
    return { ...tiers, error: "Не удалось найти базовый курс «от 1000¥» в сообщении." };
  }

  return { ...tiers, error: null };
}

export { parseCnyRateMessage };
export type { ParsedCnyRateMessage, ParsedCnyRateTiers };
