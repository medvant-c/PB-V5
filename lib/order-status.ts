import { OrderStatus } from "@/generated/prisma/enums";

// Shared between the desk clients-tab (status picker) and the client
// account dashboard (status display) — single source of truth for labels.
const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Новый",
  in_progress: "В работе",
  shipping: "В доставке",
  done: "Выполнен",
  cancelled: "Отменён",
};

// Reuses the site's existing semantic color tokens (no new colors) so each
// status reads at a glance: new=primary, in_progress=warning, shipping=
// secondary (purple, reads as "in transit"), done=success, cancelled=error.
const STATUS_BADGE_CLASSES: Record<OrderStatus, string> = {
  new: "bg-primary/10 text-primary",
  in_progress: "bg-warning/10 text-warning",
  shipping: "bg-secondary/10 text-secondary",
  done: "bg-success/10 text-success",
  cancelled: "bg-error/10 text-error",
};

// Plain hex, for contexts that can't take Tailwind classes (native <option>
// text color — background styling of option popups isn't reliably
// controllable cross-browser, so only the text itself is colored there).
const STATUS_DOT_COLOR: Record<OrderStatus, string> = {
  new: "#4f7bff",
  in_progress: "#f59e0b",
  shipping: "#7c4dff",
  done: "#22c55e",
  cancelled: "#ef4444",
};

export { STATUS_LABELS, STATUS_BADGE_CLASSES, STATUS_DOT_COLOR };
