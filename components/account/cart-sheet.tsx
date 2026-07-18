"use client";

import { Loader2, ShoppingCart, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { ServiceCatalogItemRecord } from "@/components/account/price-list";

function CartSheet({
  cart,
  onRemove,
  onSubmit,
  submitting,
  open,
  onOpenChange,
}: {
  cart: ServiceCatalogItemRecord[];
  onRemove: (id: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Открыть корзину"
          className="fixed right-6 bottom-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-white shadow-lg shadow-primary/30 transition-transform hover:scale-105"
        >
          <ShoppingCart className="h-6 w-6" />
          {cart.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-[11px] font-bold text-white">
              {cart.length}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-white">
              <ShoppingCart className="h-4 w-4" />
            </span>
            <SheetTitle>Корзина</SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-2 overflow-y-auto px-4">
          {cart.length === 0 ? (
            <p className="text-sm text-text-secondary">Пока пусто — добавьте услуги из прайс-листа.</p>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text">{item.name}</div>
                  <div className="text-xs text-text-secondary">{item.price}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  aria-label={`Убрать ${item.name}`}
                  className="shrink-0 rounded-md p-1.5 text-text-secondary transition-colors hover:bg-error/10 hover:text-error"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-border p-4">
            <p className="mb-2 text-xs text-text-secondary">
              Точная стоимость и сроки уточнит менеджер после оформления заявки.
            </p>
            <Button type="button" className="w-full" onClick={onSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Оформить заявку
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export { CartSheet };
