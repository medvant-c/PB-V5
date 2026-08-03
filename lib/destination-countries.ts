// Shared between server routes and client components (quote-dialog.tsx,
// cargo-settings-tab.tsx) — NOT server-only. Mirrors the DestinationCountry
// enum in prisma/schema.prisma; keep both in sync if a country is ever
// added. Only "russia" has real cargo tariffs as of 2026-08-02 — the rest
// exist so the owner can fill in rates later without a schema change (see
// PB-V5 chat 2026-08-02).
const DESTINATION_COUNTRIES = [
  { value: "russia", label: "Россия" },
  { value: "kazakhstan", label: "Казахстан" },
  { value: "kyrgyzstan", label: "Киргизия" },
  { value: "uzbekistan", label: "Узбекистан" },
] as const;

type DestinationCountry = (typeof DESTINATION_COUNTRIES)[number]["value"];

function destinationCountryLabel(value: string): string {
  return DESTINATION_COUNTRIES.find((c) => c.value === value)?.label ?? value;
}

// One distinct color per non-Russia country, for the small badge shown next
// to a quote's product name (see clients-tab.tsx) — russia never renders a
// badge at all, so it has no color here. Same "hex + style prop" approach
// as QUOTE_STATUS_DOT_COLOR in lib/quote-statuses.ts, not a Tailwind
// token, so a fourth country can get its own color later without needing a
// new theme color registered.
const DESTINATION_COUNTRY_COLOR: Record<Exclude<DestinationCountry, "russia">, string> = {
  kazakhstan: "#4f7bff",
  kyrgyzstan: "#7c4dff",
  uzbekistan: "#06b6d4",
};

function destinationCountryColor(value: string): string {
  return (DESTINATION_COUNTRY_COLOR as Record<string, string>)[value] ?? "#64748b";
}

export { DESTINATION_COUNTRIES, destinationCountryLabel, destinationCountryColor };
export type { DestinationCountry };
