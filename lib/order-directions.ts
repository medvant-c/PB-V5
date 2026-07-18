import { OrderDirection } from "@/generated/prisma/enums";

// Shared across the desk (services-tab direction filter, clients-tab order
// creation) and the client account portal — single source of truth for the
// 7 direction ids used throughout the site (see data/pricing.ts) and their
// human-readable labels, instead of duplicating this map in each component.
const DIRECTION_LABELS: Record<OrderDirection, string> = {
  start: "Start",
  business: "Business",
  factory: "Factory",
  logistics: "Logistics",
  fulfillment: "Fulfillment",
  ai: "AI",
  academy: "Academy",
};

const ORDER_DIRECTIONS = Object.values(OrderDirection);

export { DIRECTION_LABELS, ORDER_DIRECTIONS };
