// Shared between the status API route and the fulfillment-tab UI so the
// set of valid statuses and their Russian labels never drift apart — same
// pattern as lib/quote-statuses.ts, just a much shorter list since a
// fulfillment order's own lifecycle has no cargo/buyout side effects to
// gate on.
// shipped_paid/shipped_unpaid заменили единый "paid" — отгрузка и оплата
// не всегда совпадают по времени, нужно различать их явно. См. PB-V5 chat
// 2026-09-11.
const FULFILLMENT_ORDER_STATUSES = ["new_order", "in_progress", "done", "shipped_paid", "shipped_unpaid"] as const;

type FulfillmentOrderStatus = (typeof FULFILLMENT_ORDER_STATUSES)[number];

const FULFILLMENT_ORDER_STATUS_LABEL: Record<FulfillmentOrderStatus, string> = {
  new_order: "Новая",
  in_progress: "Принято в работу",
  done: "Выполнено",
  shipped_paid: "Отгружено/оплачено",
  shipped_unpaid: "Отгружено/не оплачено",
};

const FULFILLMENT_ORDER_STATUS_BADGE_CLASSES: Record<FulfillmentOrderStatus, string> = {
  new_order: "bg-slate-500/10 text-slate-600",
  in_progress: "bg-primary/10 text-primary",
  done: "bg-success/10 text-success",
  shipped_paid: "bg-teal-500/10 text-teal-600",
  shipped_unpaid: "bg-warning/10 text-warning",
};

const FULFILLMENT_ORDER_STATUS_DOT_COLOR: Record<FulfillmentOrderStatus, string> = {
  new_order: "#64748b",
  in_progress: "#4f7bff",
  done: "#22c55e",
  shipped_paid: "#14b8a6",
  shipped_unpaid: "#f59e0b",
};

function isFulfillmentOrderStatus(value: string): value is FulfillmentOrderStatus {
  return (FULFILLMENT_ORDER_STATUSES as readonly string[]).includes(value);
}

export {
  FULFILLMENT_ORDER_STATUSES,
  FULFILLMENT_ORDER_STATUS_LABEL,
  FULFILLMENT_ORDER_STATUS_BADGE_CLASSES,
  FULFILLMENT_ORDER_STATUS_DOT_COLOR,
  isFulfillmentOrderStatus,
};
export type { FulfillmentOrderStatus };
