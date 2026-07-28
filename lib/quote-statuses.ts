// Shared between the status API route and the client-list UI so the set of
// valid statuses and their Russian labels never drift apart.
const QUOTE_STATUSES = [
  "new_request",
  "in_progress",
  "pending_approval",
  "approved_by_client",
  "needs_replacement",
  "rejected",
  "awaiting_payment",
  "need_to_buyout",
  "in_transit_to_warehouse",
  "delivered_to_warehouse",
  "sent_to_client",
  "handed_to_client",
] as const;

type QuoteStatus = (typeof QUOTE_STATUSES)[number];

const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  new_request: "Новая заявка",
  in_progress: "Взят в работу",
  pending_approval: "На согласовании",
  approved_by_client: "Согласовано клиентом",
  needs_replacement: "Нужна замена",
  rejected: "Отказ",
  awaiting_payment: "Ждём оплату",
  need_to_buyout: "Нужно выкупить",
  in_transit_to_warehouse: "В доставке на склад",
  delivered_to_warehouse: "Доставлен на склад",
  sent_to_client: "Отправлен клиенту",
  handed_to_client: "Выдан клиенту",
};

// How long a quote can sit in "in_progress" before the list shows the
// "hurry up" banner — ties directly to manager pay, so it's a named
// constant rather than a magic number at the call site.
const STALE_IN_PROGRESS_MS = 24 * 60 * 60 * 1000;

function isQuoteStatus(value: string): value is QuoteStatus {
  return (QUOTE_STATUSES as readonly string[]).includes(value);
}

// Same bg-<token>/10 text-<token> idiom as lib/order-status.ts's
// STATUS_BADGE_CLASSES. Quote has 9 statuses vs Order's 5 semantic tokens
// (primary/secondary/success/warning/error), so the 4 without an obvious
// semantic match (awaiting_payment/need_to_buyout/delivered_to_warehouse/
// sent_to_client) reach for plain Tailwind colors in the same bg/10-text
// formula instead of reusing a token and losing at-a-glance distinctness.
const QUOTE_STATUS_BADGE_CLASSES: Record<QuoteStatus, string> = {
  new_request: "bg-slate-500/10 text-slate-600",
  in_progress: "bg-primary/10 text-primary",
  pending_approval: "bg-warning/10 text-warning",
  approved_by_client: "bg-teal-500/10 text-teal-600",
  needs_replacement: "bg-rose-500/10 text-rose-600",
  rejected: "bg-error/10 text-error",
  awaiting_payment: "bg-orange-500/10 text-orange-600",
  need_to_buyout: "bg-pink-500/10 text-pink-600",
  in_transit_to_warehouse: "bg-secondary/10 text-secondary",
  delivered_to_warehouse: "bg-cyan-500/10 text-cyan-600",
  sent_to_client: "bg-indigo-500/10 text-indigo-600",
  handed_to_client: "bg-success/10 text-success",
};

// Plain hex — same reasoning as STATUS_DOT_COLOR in lib/order-status.ts
// (contexts that can't take Tailwind classes, e.g. a colored dot next to a
// native <option>).
const QUOTE_STATUS_DOT_COLOR: Record<QuoteStatus, string> = {
  new_request: "#64748b",
  in_progress: "#4f7bff",
  pending_approval: "#f59e0b",
  approved_by_client: "#14b8a6",
  needs_replacement: "#f43f5e",
  rejected: "#ef4444",
  awaiting_payment: "#f97316",
  need_to_buyout: "#ec4899",
  in_transit_to_warehouse: "#7c4dff",
  delivered_to_warehouse: "#06b6d4",
  sent_to_client: "#6366f1",
  handed_to_client: "#22c55e",
};

export {
  QUOTE_STATUSES,
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_BADGE_CLASSES,
  QUOTE_STATUS_DOT_COLOR,
  STALE_IN_PROGRESS_MS,
  isQuoteStatus,
};
export type { QuoteStatus };
