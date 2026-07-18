"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { OrderDirection } from "@/generated/prisma/enums";
import { DIRECTION_LABELS, ORDER_DIRECTIONS } from "@/lib/order-directions";
import { cn } from "@/lib/utils";

interface ServiceCatalogItemRecord {
  id: string;
  direction: OrderDirection;
  name: string;
  price: string;
}

function PriceList({
  cartIds,
  onAddToCart,
}: {
  cartIds: Set<string>;
  onAddToCart: (item: ServiceCatalogItemRecord) => void;
}) {
  const [items, setItems] = useState<ServiceCatalogItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDirection, setActiveDirection] = useState<OrderDirection>(ORDER_DIRECTIONS[0]);

  useEffect(() => {
    fetch("/api/account-service-catalog")
      .then((res) => res.json())
      .then((data) => {
        if (data.items) setItems(data.items);
      })
      .finally(() => setLoading(false));
  }, []);

  const visibleItems = useMemo(() => items.filter((item) => item.direction === activeDirection), [items, activeDirection]);

  return (
    <div>
      <h2 className="text-sm font-bold text-text">Прайс-лист</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Выберите услуги и добавьте в корзину — менеджер свяжется с вами для подтверждения и уточнения деталей.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {ORDER_DIRECTIONS.map((direction) => (
          <button
            key={direction}
            type="button"
            onClick={() => setActiveDirection(direction)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              activeDirection === direction
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface text-text-secondary hover:text-text",
            )}
          >
            {DIRECTION_LABELS[direction]}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-1.5">
        {loading ? (
          <p className="text-xs text-text-secondary">Загрузка…</p>
        ) : visibleItems.length === 0 ? (
          <p className="text-xs text-text-secondary">В этом направлении пока нет услуг.</p>
        ) : (
          visibleItems.map((item) => {
            const inCart = cartIds.has(item.id);
            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text">{item.name}</div>
                  <div className="text-xs text-text-secondary">{item.price}</div>
                </div>
                <button
                  type="button"
                  onClick={() => !inCart && onAddToCart(item)}
                  disabled={inCart}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    inCart
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-border text-text-secondary hover:border-primary/30 hover:text-primary",
                  )}
                >
                  {inCart ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> В корзине
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" /> В корзину
                    </>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export { PriceList };
export type { ServiceCatalogItemRecord };
