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

export { DESTINATION_COUNTRIES, destinationCountryLabel };
export type { DestinationCountry };
