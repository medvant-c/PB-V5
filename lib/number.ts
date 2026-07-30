// Some mobile keyboards (Russian locale) insert a comma as the decimal
// separator into a type="number" input instead of a period — Number()
// silently returns NaN for "12,8" with no visible error, which then quietly
// zeroes or NaNs out downstream pricing math (see PB-V5 chat 2026-07-30:
// a quote's ¥→₽ conversion going to 0 because "3,7" parsed as NaN and a
// nullish-coalescing fallback doesn't catch NaN). Normalize at every read
// site that accepts free-typed numeric input from a user, not just the
// couple of spots this was first noticed (lib/desk-services/quote-request.ts,
// components/manager/quote-dialog.tsx, components/manager/tabs/confirmations-tab.tsx).
function parseLocaleNumber(value: string): number {
  return Number(value.replace(",", "."));
}

export { parseLocaleNumber };
