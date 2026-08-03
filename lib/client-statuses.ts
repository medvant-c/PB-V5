// Shared between the status API route and the client-list UI so the set of
// valid statuses and their Russian labels never drift apart — same
// reasoning as lib/quote-statuses.ts, just for Client.status (the
// relationship's own status, independent of any individual quote's).
const CLIENT_STATUSES = ["new", "making_quotes", "rejected", "no_active_requests"] as const;

type ClientStatus = (typeof CLIENT_STATUSES)[number];

const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  new: "Новый",
  making_quotes: "Делаем просчёты",
  rejected: "Отказ",
  no_active_requests: "Активных заявок нет",
};

function isClientStatus(value: string): value is ClientStatus {
  return (CLIENT_STATUSES as readonly string[]).includes(value);
}

// Same bg-<token>/10 text-<token> idiom as QUOTE_STATUS_BADGE_CLASSES.
const CLIENT_STATUS_BADGE_CLASSES: Record<ClientStatus, string> = {
  new: "bg-primary/10 text-primary",
  making_quotes: "bg-warning/10 text-warning",
  rejected: "bg-error/10 text-error",
  no_active_requests: "bg-slate-500/10 text-slate-600",
};

// Plain hex — same reasoning as QUOTE_STATUS_DOT_COLOR (contexts that
// can't take Tailwind classes, e.g. a colored dot next to a native <option>).
const CLIENT_STATUS_DOT_COLOR: Record<ClientStatus, string> = {
  new: "#4f7bff",
  making_quotes: "#f59e0b",
  rejected: "#ef4444",
  no_active_requests: "#64748b",
};

export { CLIENT_STATUSES, CLIENT_STATUS_LABEL, CLIENT_STATUS_BADGE_CLASSES, CLIENT_STATUS_DOT_COLOR, isClientStatus };
export type { ClientStatus };
