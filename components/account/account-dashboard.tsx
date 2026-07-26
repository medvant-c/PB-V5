"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Download, LogOut, PackageOpen } from "lucide-react";
import { OrderStatus } from "@/generated/prisma/enums";
import { DIRECTION_LABELS } from "@/lib/order-directions";
import { STATUS_BADGE_CLASSES, STATUS_LABELS } from "@/lib/order-status";
import { cn } from "@/lib/utils";
import {
  PriceList,
  type ServiceCatalogItemRecord,
} from "@/components/account/price-list";
import { CartSheet } from "@/components/account/cart-sheet";
import {
  AccountQuotes,
  type AccountQuote,
} from "@/components/account/account-quotes";
import { ServicePriceList } from "@/components/account/service-price-list";

interface AccountOrderEvent {
  id: string;
  status: OrderStatus;
  note: string | null;
  createdAt: string;
}

interface AccountOrder {
  id: string;
  direction: string;
  title: string;
  price: string | null;
  status: OrderStatus;
  createdAt: string;
  events: AccountOrderEvent[];
}

interface AccountDocument {
  id: string;
  relatedId: string | null;
  originalName: string;
  size: number;
  uploadedAt: string;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function AccountDashboard({
  orders,
  documents,
  quotes,
}: {
  orders: AccountOrder[];
  documents: AccountDocument[];
  quotes: AccountQuote[];
}) {
  const router = useRouter();
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(
    orders[0]?.id ?? null,
  );
  const [loggingOut, setLoggingOut] = useState(false);

  const [cart, setCart] = useState<ServiceCatalogItemRecord[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [submittingCart, setSubmittingCart] = useState(false);
  const cartIds = new Set(cart.map((item) => item.id));

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/account-logout", { method: "POST" });
      router.push("/account");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  function handleAddToCart(item: ServiceCatalogItemRecord) {
    setCart((current) =>
      current.some((c) => c.id === item.id) ? current : [...current, item],
    );
  }

  function handleRemoveFromCart(id: string) {
    setCart((current) => current.filter((item) => item.id !== id));
  }

  async function handleSubmitCart() {
    if (submittingCart || cart.length === 0) return;
    setSubmittingCart(true);
    try {
      const res = await fetch("/api/account-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceCatalogItemIds: cart.map((item) => item.id),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCart([]);
        setCartOpen(false);
        toast.success("Заявка оформлена — менеджер свяжется с вами.");
        router.refresh();
      } else {
        toast.error(data.error ?? "Не удалось оформить заявку.");
      }
    } catch {
      toast.error("Не удалось связаться с сервером.");
    } finally {
      setSubmittingCart(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text">Личный кабинет</h1>
          <p className="text-sm text-text-secondary">
            Ваши заказы, статусы и документы
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-error disabled:opacity-50"
        >
          <LogOut className="h-3.5 w-3.5" />
          Выйти
        </button>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[300px_1fr] lg:items-start">
        <aside className="lg:sticky lg:top-6">
          <ServicePriceList />
        </aside>

        <div className="min-w-0">
          <div>
            <h2 className="text-base font-bold text-text">Мои просчёты</h2>
            <p className="mb-3 text-sm text-text-secondary">
              Что и на каких условиях вам посчитал менеджер
            </p>
            <AccountQuotes quotes={quotes} />
          </div>

          <div className="mt-10 border-t border-border pt-8">
            <h2 className="text-base font-bold text-text">Заказы</h2>
          </div>

          {orders.length === 0 ? (
            <div className="mt-3 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
              <PackageOpen className="h-8 w-8 text-text-secondary" />
              <p className="text-sm text-text-secondary">
                Заказов пока нет — они появятся здесь, как только менеджер их
                оформит.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {orders.map((order) => {
                const isOpen = expandedOrderId === order.id;
                const orderDocuments = documents.filter(
                  (doc) => doc.relatedId === order.id,
                );
                return (
                  <div
                    key={order.id}
                    className="rounded-2xl border border-border bg-surface shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedOrderId(isOpen ? null : order.id)
                      }
                      className="flex w-full items-center justify-between gap-3 p-4 text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-text">
                          {order.title}
                          {order.price ? (
                            <span className="ml-2 font-normal text-text-secondary">
                              · {order.price}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 text-xs text-text-secondary">
                          {DIRECTION_LABELS[
                            order.direction as keyof typeof DIRECTION_LABELS
                          ] ?? order.direction}{" "}
                          · {formatDate(order.createdAt)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium",
                            STATUS_BADGE_CLASSES[order.status],
                          )}
                        >
                          {STATUS_LABELS[order.status]}
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-text-secondary transition-transform",
                            isOpen && "rotate-180",
                          )}
                        />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="space-y-4 border-t border-border p-4">
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-text-secondary">
                            История статуса
                          </p>
                          <ul className="space-y-1 text-xs text-text-secondary">
                            {order.events.map((event) => (
                              <li key={event.id}>
                                {formatDate(event.createdAt)} —{" "}
                                {STATUS_LABELS[event.status]}
                                {event.note ? ` (${event.note})` : ""}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-text-secondary">
                            Документы
                          </p>
                          {orderDocuments.length === 0 ? (
                            <p className="text-xs text-text-secondary">
                              Документов пока нет.
                            </p>
                          ) : (
                            <ul className="space-y-1.5">
                              {orderDocuments.map((doc) => (
                                <li
                                  key={doc.id}
                                  className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate font-medium text-text">
                                      {doc.originalName}
                                    </div>
                                    <div className="text-[11px] text-text-secondary">
                                      {formatSize(doc.size)} ·{" "}
                                      {formatDate(doc.uploadedAt)}
                                    </div>
                                  </div>
                                  <a
                                    href={`/api/account-documents/${doc.id}`}
                                    aria-label={`Скачать ${doc.originalName}`}
                                    className="shrink-0 rounded-md p-1.5 text-text-secondary transition-colors hover:bg-black/5 hover:text-primary"
                                  >
                                    <Download className="h-4 w-4" />
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-10 border-t border-border pt-8">
            <PriceList cartIds={cartIds} onAddToCart={handleAddToCart} />
          </div>
        </div>
      </div>

      <CartSheet
        cart={cart}
        onRemove={handleRemoveFromCart}
        onSubmit={handleSubmitCart}
        submitting={submittingCart}
        open={cartOpen}
        onOpenChange={setCartOpen}
      />
    </div>
  );
}

export { AccountDashboard };
