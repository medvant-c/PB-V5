"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface ServiceCatalogItemRecord {
  id: string;
  code: string;
  direction: string;
  name: string;
  price: string;
}

const DIRECTION_LABEL: Record<string, string> = {
  fulfillment: "Фулфилмент",
  start: "Старт",
  business: "Бизнес",
  factory: "Производство",
  logistics: "Логистика",
  ai: "AI",
  academy: "Обучение",
};

// Fixed display order for the group headers — Fulfillment, Start, Business
// first (the directions the owner cares about seeing first), the rest
// after in their usual order. Object.entries() over a reduce()-built map
// would otherwise follow whatever order items happened to load in.
const DIRECTION_ORDER = ["fulfillment", "start", "business", "factory", "logistics", "ai", "academy"];

// This is the live catalog behind /account's client-facing price list and
// cart checkout — editing a price here changes what a client sees and can
// order today, not just an internal reference sheet.
function ManagerPriceListTab() {
  const [items, setItems] = useState<ServiceCatalogItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { name: string; price: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedDirections, setExpandedDirections] = useState<Set<string>>(new Set());

  function toggleDirection(direction: string) {
    setExpandedDirections((current) => {
      const next = new Set(current);
      if (next.has(direction)) next.delete(direction);
      else next.add(direction);
      return next;
    });
  }

  const [showNewForm, setShowNewForm] = useState(false);
  const [newDirection, setNewDirection] = useState("start");
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/manager-service-catalog");
      const data = await res.json();
      if (res.ok) {
        setItems(data.items);
        setDrafts(Object.fromEntries(data.items.map((i: ServiceCatalogItemRecord) => [i.id, { name: i.name, price: i.price }])));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(id: string, original: ServiceCatalogItemRecord) {
    const draft = drafts[id];
    if (!draft || (draft.name === original.name && draft.price === original.price)) return;
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/manager-service-catalog/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (res.ok) await load();
      else {
        const data = await res.json();
        setActionError(data.error ?? "Не удалось сохранить услугу.");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Удалить эту услугу из прайс-листа?")) return;
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/manager-service-catalog/${id}`, { method: "DELETE" });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/manager-service-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction: newDirection, name: newName, price: newPrice }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error ?? "Не удалось добавить услугу.");
        return;
      }
      setNewName("");
      setNewPrice("");
      setShowNewForm(false);
      await load();
    } catch {
      setCreateError("Не удалось связаться с сервером.");
    } finally {
      setCreating(false);
    }
  }

  const itemsByDirection = items.reduce<Record<string, ServiceCatalogItemRecord[]>>((acc, item) => {
    (acc[item.direction] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-text">Прайс-лист</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Тот же прайс-лист, что клиент видит в личном кабинете и может заказать через корзину — изменение
            цены здесь действует сразу.
          </p>
        </div>
        {!showNewForm && (
          <Button type="button" size="sm" variant="outline" onClick={() => setShowNewForm(true)}>
            <Plus className="h-4 w-4" /> Новая услуга
          </Button>
        )}
      </div>

      {showNewForm && (
        <form onSubmit={handleCreate} className="space-y-2 rounded-xl border border-dashed border-border p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Select value={newDirection} onValueChange={setNewDirection}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DIRECTION_LABEL).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Название услуги" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder="Цена (например, 8 000 ₽)" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
          </div>
          {createError && <p className="text-xs text-error">{createError}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Добавить"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewForm(false)}>
              Отмена
            </Button>
          </div>
        </form>
      )}

      {actionError && <p className="text-xs text-error">{actionError}</p>}

      {loading ? (
        <p className="text-sm text-text-secondary">Загрузка…</p>
      ) : (
        <div className="space-y-2">
          {DIRECTION_ORDER.filter((direction) => itemsByDirection[direction]?.length).map((direction) => {
            const directionItems = itemsByDirection[direction];
            const isOpen = expandedDirections.has(direction);
            return (
              <div key={direction} className="rounded-xl border border-border bg-surface">
                <button
                  type="button"
                  onClick={() => toggleDirection(direction)}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left"
                >
                  <span className="text-sm font-semibold text-text">
                    {DIRECTION_LABEL[direction] ?? direction}{" "}
                    <span className="font-normal text-text-secondary">({directionItems.length})</span>
                  </span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-secondary transition-transform", isOpen && "rotate-180")} />
                </button>

                {isOpen && (
                  <div className="space-y-1.5 border-t border-border p-3">
                    {directionItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 rounded-lg border border-border bg-bg px-2.5 py-1.5">
                        <span className="w-16 shrink-0 font-mono text-xs text-text-secondary">{item.code}</span>
                        <Input
                          value={drafts[item.id]?.name ?? item.name}
                          onChange={(e) => setDrafts((c) => ({ ...c, [item.id]: { ...c[item.id], name: e.target.value } }))}
                          onBlur={() => handleSave(item.id, item)}
                          disabled={busyId === item.id}
                          className="h-8 min-w-0 flex-1 text-sm"
                        />
                        <Input
                          value={drafts[item.id]?.price ?? item.price}
                          onChange={(e) => setDrafts((c) => ({ ...c, [item.id]: { ...c[item.id], price: e.target.value } }))}
                          onBlur={() => handleSave(item.id, item)}
                          disabled={busyId === item.id}
                          className="h-8 w-32 shrink-0 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          disabled={busyId === item.id}
                          className="shrink-0 text-text-secondary transition-colors hover:text-error disabled:opacity-50"
                          aria-label="Удалить услугу"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { ManagerPriceListTab };
