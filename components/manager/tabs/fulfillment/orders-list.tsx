"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Download,
  ImageIcon,
  Loader2,
  Package,
  Pencil,
  Plus,
  Printer,
  Receipt,
  Trash2,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/desk/empty-state";
import { cn } from "@/lib/utils";
import {
  FULFILLMENT_ORDER_STATUSES,
  FULFILLMENT_ORDER_STATUS_BADGE_CLASSES,
  FULFILLMENT_ORDER_STATUS_LABEL,
  type FulfillmentOrderStatus,
} from "@/lib/fulfillment-statuses";
import {
  PeriodFilter,
  PERIOD_OPTIONS,
  periodStart,
  ServiceItemRecord,
  ClientOption,
  QuoteOption,
  ProductCardRecord,
  ServiceLine,
  moneyCny,
  serviceLineTotalRub,
  serviceLineTotalCny,
  ServiceLineEditor,
} from "./shared";

interface OrderServiceRecord {
  id: string;
  serviceItemId: string | null;
  name: string;
  priceCny: string;
  priceRub: string;
  quantity: number;
  completedAt: string | null;
  completedByManager: { id: string; name: string } | null;
}

interface OrderItemRecord {
  id: string;
  name: string;
  sku: string | null;
  dimensions: string | null;
  plannedQuantity: number;
  receivedQuantity: number | null;
  productCardId: string | null;
  photoId: string | null;
  services: OrderServiceRecord[];
}

interface OrderLevelServiceRecord {
  id: string;
  name: string;
  priceCny: string;
  priceRub: string;
  quantity: number;
}

interface PrintLogRecord {
  id: string;
  printedAt: string;
  printedByManager: { id: string; name: string };
}

interface FulfillmentOrderRecord {
  id: string;
  displayId: number;
  totalRub: string;
  cnyRateUsed: string;
  createdAt: string;
  receivedAt: string | null;
  plannedShipAt: string | null;
  status: FulfillmentOrderStatus;
  archivedAt: string | null;
  client: { id: string; name: string; company: string | null; fulfillmentCode: string | null };
  manager: { id: string; name: string };
  quote: { id: string; displayId: number; productName: string } | null;
  items: OrderItemRecord[];
  orderServices: OrderLevelServiceRecord[];
  printLogs: PrintLogRecord[];
}

interface DraftItem {
  key: string;
  name: string;
  sku: string;
  dimensions: string;
  plannedQuantity: string;
  productCardId: string | null;
  services: ServiceLine[];
}

function blankDraftItem(): DraftItem {
  return { key: crypto.randomUUID(), name: "", sku: "", dimensions: "", plannedQuantity: "1", productCardId: null, services: [] };
}

interface FulfillmentOrdersListProps {
  title: string;
  description: string;
  // Без фильтра — все статусы (вкладка «Заявки на обработку»); с фильтром
  // — только перечисленные (вкладка «Отгрузки»: shipped_paid/shipped_unpaid).
  statusFilter?: FulfillmentOrderStatus[];
}

// Список заявок на обработку — кросс-клиентный (используется и «Заявками
// на обработку», и «Отгрузками», см. план «Фулфилмент: под-вкладки»).
// Раньше жил внутри одного экрана «Клиенты» и был жёстко привязан к
// выбранному слева клиенту — теперь показывает клиента в каждой строке и
// имеет собственный фильтр/пикер клиента. См. PB-V5 chat 2026-09-12.
function FulfillmentOrdersList({ title, description, statusFilter }: FulfillmentOrdersListProps) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [cnyRateRub, setCnyRateRub] = useState(0);
  const [itemServices, setItemServices] = useState<ServiceItemRecord[]>([]);
  const [orderLevelServices, setOrderLevelServices] = useState<ServiceItemRecord[]>([]);

  useEffect(() => {
    fetch("/api/manager-clients?kind=fulfillment")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setClients(data?.clients ?? []));
    fetch("/api/manager-tariffs")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setCnyRateRub(Number(data?.settings?.cnyRateRub) || 0));
    Promise.all([fetch("/api/manager-fulfillment-services?scope=item"), fetch("/api/manager-fulfillment-services?scope=order")]).then(
      async ([itemRes, orderRes]) => {
        const [itemData, orderData] = await Promise.all([itemRes.json(), orderRes.json()]);
        if (itemRes.ok) setItemServices(itemData.items);
        if (orderRes.ok) setOrderLevelServices(orderData.items);
      },
    );
  }, []);

  // --- Заявки ---
  const [orders, setOrders] = useState<FulfillmentOrderRecord[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(null);
  const [busyServiceCompletionId, setBusyServiceCompletionId] = useState<string | null>(null);
  const [busyOrderActionId, setBusyOrderActionId] = useState<string | null>(null);
  const [busyReceiveItemId, setBusyReceiveItemId] = useState<string | null>(null);
  const [receiveDrafts, setReceiveDrafts] = useState<Record<string, string>>({});

  const [showArchived, setShowArchived] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState<PeriodFilter>("all");
  const [filterClientId, setFilterClientId] = useState("all");

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const res = await fetch(`/api/manager-fulfillment-orders${showArchived ? "?includeArchived=1" : ""}`);
      const data = await res.json();
      if (res.ok) setOrders(data.orders);
    } finally {
      setLoadingOrders(false);
    }
  }, [showArchived]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const visibleOrders = useMemo(() => {
    const since = periodStart(filterPeriod);
    return orders.filter((order) => {
      if (statusFilter && !statusFilter.includes(order.status)) return false;
      if (filterClientId !== "all" && order.client.id !== filterClientId) return false;
      if (since && new Date(order.createdAt) < since) return false;
      return true;
    });
  }, [orders, statusFilter, filterClientId, filterPeriod]);

  // --- Ручная форма создания/редактирования заявки (свёрнута по умолчанию) ---
  const [showManualOrderForm, setShowManualOrderForm] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [formClientId, setFormClientId] = useState("");
  const [formProductCards, setFormProductCards] = useState<ProductCardRecord[]>([]);
  const [quoteId, setQuoteId] = useState("");
  const [clientQuotes, setClientQuotes] = useState<QuoteOption[]>([]);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([blankDraftItem()]);
  const [draftOrderServices, setDraftOrderServices] = useState<ServiceLine[]>([]);
  const [receivedAt, setReceivedAt] = useState("");
  const [plannedShipAt, setPlannedShipAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!formClientId) {
      setFormProductCards([]);
      setClientQuotes([]);
      setQuoteId("");
      return;
    }
    fetch(`/api/manager-fulfillment-product-cards?clientId=${formClientId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setFormProductCards(data?.cards ?? []));
    fetch(`/api/manager-quotes?clientId=${formClientId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setClientQuotes(data?.quotes ?? []));
  }, [formClientId]);

  function itemTotalRub(item: DraftItem): number {
    return item.services.reduce((sum, line) => sum + serviceLineTotalRub(line, cnyRateRub), 0);
  }
  function itemTotalCny(item: DraftItem): number {
    return item.services.reduce((sum, line) => sum + serviceLineTotalCny(line), 0);
  }

  const orderTotalRub = useMemo(
    () =>
      draftItems.reduce((sum, item) => sum + itemTotalRub(item), 0) +
      draftOrderServices.reduce((sum, line) => sum + serviceLineTotalRub(line, cnyRateRub), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftItems, draftOrderServices, cnyRateRub],
  );
  const orderTotalCny = useMemo(
    () =>
      draftItems.reduce((sum, item) => sum + itemTotalCny(item), 0) +
      draftOrderServices.reduce((sum, line) => sum + serviceLineTotalCny(line), 0),
    [draftItems, draftOrderServices],
  );

  function updateDraftItem(key: string, patch: Partial<DraftItem>) {
    setDraftItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function pickProductCard(itemKey: string, cardId: string) {
    if (!cardId) {
      updateDraftItem(itemKey, { productCardId: null });
      return;
    }
    const card = formProductCards.find((c) => c.id === cardId);
    if (!card) return;
    updateDraftItem(itemKey, {
      productCardId: cardId,
      name: card.name,
      sku: card.sku ?? "",
      dimensions: card.dimensions ?? "",
      services: card.services.map((s) => ({ key: crypto.randomUUID(), serviceItemId: s.serviceItemId, name: s.name, priceCny: s.priceCny, quantity: "1" })),
    });
  }

  function addDraftItem() {
    setDraftItems((current) => [...current, blankDraftItem()]);
  }
  function removeDraftItem(key: string) {
    setDraftItems((current) => (current.length > 1 ? current.filter((item) => item.key !== key) : current));
  }

  function handleCancelEdit() {
    setShowManualOrderForm(false);
    setEditingOrderId(null);
    setFormClientId("");
    setDraftItems([blankDraftItem()]);
    setDraftOrderServices([]);
    setQuoteId("");
    setReceivedAt("");
    setPlannedShipAt("");
    setFormError(null);
  }

  async function handleCreateOrEditOrder() {
    if (!formClientId) {
      setFormError("Выберите клиента.");
      return;
    }
    const items = draftItems
      .filter((item) => item.name.trim())
      .map((item) => ({
        name: item.name.trim(),
        sku: item.sku.trim() || undefined,
        dimensions: item.dimensions.trim() || undefined,
        plannedQuantity: Number(item.plannedQuantity) || 1,
        productCardId: item.productCardId,
        services: item.services
          .filter((line) => line.name.trim() && Number(line.priceCny) >= 0 && Number(line.quantity) > 0)
          .map((line) => ({ serviceItemId: line.serviceItemId, name: line.name.trim(), priceCny: Number(line.priceCny), quantity: Number(line.quantity) })),
      }));
    if (items.length === 0) {
      setFormError("Укажите название хотя бы одного товара.");
      return;
    }
    const emptyItem = items.find((item) => item.services.length === 0);
    if (emptyItem) {
      setFormError(`У товара «${emptyItem.name}» не выбрано ни одной услуги.`);
      return;
    }
    const orderServices = draftOrderServices
      .filter((line) => line.name.trim() && Number(line.priceCny) >= 0 && Number(line.quantity) > 0)
      .map((line) => ({ name: line.name.trim(), priceCny: Number(line.priceCny), quantity: Number(line.quantity) }));

    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(editingOrderId ? `/api/manager-fulfillment-orders/${editingOrderId}` : "/api/manager-fulfillment-orders", {
        method: editingOrderId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: formClientId,
          quoteId: quoteId || null,
          items,
          orderServices,
          receivedAt: receivedAt || null,
          plannedShipAt: plannedShipAt || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Не удалось сохранить заявку.");
        return;
      }
      handleCancelEdit();
      await loadOrders();
    } catch {
      setFormError("Не удалось связаться с сервером.");
    } finally {
      setSaving(false);
    }
  }

  function handleEditOrder(order: FulfillmentOrderRecord) {
    setShowManualOrderForm(true);
    setEditingOrderId(order.id);
    setFormClientId(order.client.id);
    setQuoteId(order.quote?.id ?? "");
    setReceivedAt(order.receivedAt ? order.receivedAt.slice(0, 10) : "");
    setPlannedShipAt(order.plannedShipAt ? order.plannedShipAt.slice(0, 10) : "");
    setFormError(null);
    setDraftItems(
      order.items.length > 0
        ? order.items.map((item) => ({
            key: crypto.randomUUID(),
            name: item.name,
            sku: item.sku ?? "",
            dimensions: item.dimensions ?? "",
            plannedQuantity: String(item.plannedQuantity),
            productCardId: item.productCardId,
            services: item.services.map((s) => ({ key: crypto.randomUUID(), serviceItemId: s.serviceItemId, name: s.name, priceCny: s.priceCny, quantity: String(s.quantity) })),
          }))
        : [blankDraftItem()],
    );
    setDraftOrderServices(
      order.orderServices.map((s) => ({ key: crypto.randomUUID(), serviceItemId: null, name: s.name, priceCny: s.priceCny, quantity: String(s.quantity) })),
    );
    setExpandedOrderId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteOrder(id: string) {
    if (!window.confirm("Удалить эту заявку безвозвратно?")) return;
    setBusyOrderActionId(id);
    try {
      const res = await fetch(`/api/manager-fulfillment-orders/${id}`, { method: "DELETE" });
      if (res.ok) await loadOrders();
    } finally {
      setBusyOrderActionId(null);
    }
  }

  async function handleToggleArchiveOrder(order: FulfillmentOrderRecord) {
    if (!order.archivedAt && !window.confirm("Отправить эту заявку в архив?")) return;
    setBusyOrderActionId(order.id);
    try {
      const res = await fetch(`/api/manager-fulfillment-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !order.archivedAt }),
      });
      if (res.ok) await loadOrders();
    } finally {
      setBusyOrderActionId(null);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    setBusyOrderActionId(id);
    try {
      const res = await fetch(`/api/manager-fulfillment-orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) await loadOrders();
    } finally {
      setBusyOrderActionId(null);
    }
  }

  async function handleUpdateOrderDates(id: string, patch: { receivedAt?: string | null; plannedShipAt?: string | null }) {
    setBusyOrderActionId(id);
    try {
      const res = await fetch(`/api/manager-fulfillment-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) await loadOrders();
    } finally {
      setBusyOrderActionId(null);
    }
  }

  async function handleToggleServiceCompleted(serviceId: string, completed: boolean) {
    setBusyServiceCompletionId(serviceId);
    try {
      const res = await fetch(`/api/manager-fulfillment-order-services/${serviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (res.ok) await loadOrders();
    } finally {
      setBusyServiceCompletionId(null);
    }
  }

  async function handleSaveReceivedQuantity(itemId: string) {
    const draft = receiveDrafts[itemId];
    if (draft === undefined) return;
    setBusyReceiveItemId(itemId);
    try {
      const res = await fetch(`/api/manager-fulfillment-order-items/${itemId}/receive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receivedQuantity: draft.trim() === "" ? null : Number(draft) }),
      });
      if (res.ok) await loadOrders();
    } finally {
      setBusyReceiveItemId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-bold text-text">{title}</p>
        <p className="mt-0.5 text-xs text-text-secondary">{description}</p>
      </div>

      {!showManualOrderForm ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowManualOrderForm(true)}>
          <Plus className="h-3.5 w-3.5" /> Создать заявку вручную
        </Button>
      ) : (
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
            <span>{editingOrderId ? "Редактирование заявки" : "Новая заявка на обработку"}</span>
            <button type="button" onClick={handleCancelEdit} className="flex items-center gap-1 hover:underline">
              <X className="h-3.5 w-3.5" /> {editingOrderId ? "Отменить" : "Свернуть"}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Клиент</Label>
              <Select value={formClientId} onValueChange={setFormClientId} disabled={Boolean(editingOrderId)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Выберите клиента" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.company ? ` (${c.company})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Просчёт (необязательно)</Label>
              <Select value={quoteId} onValueChange={setQuoteId} disabled={clientQuotes.length === 0}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Без привязки к просчёту" />
                </SelectTrigger>
                <SelectContent>
                  {clientQuotes.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      №{q.displayId} · {q.productName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Принято на складе</Label>
                <Input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Плановая отгрузка</Label>
                <Input type="date" value={plannedShipAt} onChange={(e) => setPlannedShipAt(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {draftItems.map((item, index) => (
              <div key={item.key} className="rounded-lg border border-border bg-bg p-3 space-y-2.5">
                <div className="flex items-start gap-2">
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                    {formProductCards.length > 0 && (
                      <Select value={item.productCardId ?? ""} onValueChange={(v) => pickProductCard(item.key, v)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Выбрать карточку товара" />
                        </SelectTrigger>
                        <SelectContent>
                          {formProductCards.map((card) => (
                            <SelectItem key={card.id} value={card.id}>
                              {card.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Input
                      placeholder={`Название товара ${draftItems.length > 1 ? `№${index + 1}` : ""}`}
                      value={item.name}
                      onChange={(e) => updateDraftItem(item.key, { name: e.target.value })}
                    />
                    <Input placeholder="Артикул" value={item.sku} onChange={(e) => updateDraftItem(item.key, { sku: e.target.value })} />
                    <Input placeholder="Габариты" value={item.dimensions} onChange={(e) => updateDraftItem(item.key, { dimensions: e.target.value })} />
                    <Input
                      type="number"
                      min={1}
                      step="1"
                      placeholder="План, шт."
                      value={item.plannedQuantity}
                      onChange={(e) => updateDraftItem(item.key, { plannedQuantity: e.target.value })}
                    />
                  </div>
                  {draftItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDraftItem(item.key)}
                      className="shrink-0 rounded-md p-2 text-text-secondary transition-colors hover:bg-error/10 hover:text-error"
                      aria-label="Удалить товар"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <ServiceLineEditor lines={item.services} services={itemServices} cnyRateRub={cnyRateRub} onChange={(lines) => updateDraftItem(item.key, { services: lines })} />
                <p className="text-right text-xs text-text-secondary">Товар: {moneyCny(itemTotalCny(item), itemTotalRub(item))}</p>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={addDraftItem}>
            <Plus className="h-4 w-4" /> Добавить товар
          </Button>

          <div className="space-y-1.5 border-t border-border pt-3">
            <Label className="text-xs text-text-secondary">Услуги на партию целиком (не привязаны к товару)</Label>
            <ServiceLineEditor lines={draftOrderServices} services={orderLevelServices} cnyRateRub={cnyRateRub} onChange={setDraftOrderServices} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-sm font-bold text-text">Итого: {moneyCny(orderTotalCny, orderTotalRub)}</p>
            <Button type="button" onClick={handleCreateOrEditOrder} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingOrderId ? "Сохранить изменения" : "Сохранить заявку"}
            </Button>
          </div>
          {formError && <p className="text-xs text-error">{formError}</p>}
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterClientId} onValueChange={setFilterClientId}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все клиенты</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
                {c.company ? ` (${c.company})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilterPeriod(opt.value)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                filterPeriod === opt.value ? "bg-primary/10 text-primary" : "text-text-secondary hover:text-text",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-text-secondary">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Показывать архивные
        </label>
      </div>

      {loadingOrders ? (
        <p className="text-sm text-text-secondary">Загрузка…</p>
      ) : visibleOrders.length === 0 ? (
        <EmptyState icon={Package} message="Заявок пока нет." />
      ) : (
        <div className="space-y-2">
          {visibleOrders.map((order) => {
            const isOpen = expandedOrderId === order.id;
            const totalServices = order.items.reduce((sum, item) => sum + item.services.length, 0);
            const completedServices = order.items.reduce((sum, item) => sum + item.services.filter((s) => s.completedAt).length, 0);
            return (
              <div key={order.id} className={cn("rounded-xl border border-border bg-surface", order.archivedAt && "opacity-60")}>
                <button type="button" onClick={() => setExpandedOrderId(isOpen ? null : order.id)} className="flex w-full flex-wrap items-center gap-3 p-3 text-left">
                  <span className="text-xs text-text-secondary">{new Date(order.createdAt).toLocaleDateString("ru-RU")}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                    №{order.displayId} · {order.client.name}
                    {order.client.company ? ` (${order.client.company})` : ""}
                    {order.archivedAt && <span className="ml-1.5 text-xs font-normal text-error">архив</span>}
                  </span>
                  {order.quote && <span className="shrink-0 text-xs text-text-secondary">Просчёт №{order.quote.displayId}</span>}
                  <span className="shrink-0 text-xs text-text-secondary">
                    {order.items.length} тов. · {completedServices}/{totalServices} услуг
                  </span>
                  {order.printLogs.length > 0 && (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-text-secondary">
                      <Printer className="h-3.5 w-3.5" /> {order.printLogs.length}
                    </span>
                  )}
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", FULFILLMENT_ORDER_STATUS_BADGE_CLASSES[order.status])}>
                    {FULFILLMENT_ORDER_STATUS_LABEL[order.status]}
                  </span>
                  <span className="shrink-0 text-sm font-bold text-text">
                    {(Number(order.totalRub) / Number(order.cnyRateUsed)).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ¥
                  </span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-secondary transition-transform", isOpen && "rotate-180")} />
                </button>

                {isOpen && (
                  <div className="space-y-3 border-t border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-text-secondary">Менеджер: {order.manager.name}</span>
                        <Select value={order.status} onValueChange={(status) => handleStatusChange(order.id, status)} disabled={busyOrderActionId === order.id}>
                          <SelectTrigger className="h-7 w-44 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FULFILLMENT_ORDER_STATUSES.map((status) => (
                              <SelectItem key={status} value={status}>
                                {FULFILLMENT_ORDER_STATUS_LABEL[status]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <a
                          href={`/api/manager-fulfillment-orders/${order.id}/pdf`}
                          onClick={() => setTimeout(() => loadOrders(), 800)}
                          className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
                        >
                          <Download className="h-3.5 w-3.5" /> Наряд
                        </a>
                        <a
                          href={`/api/manager-fulfillment-orders/${order.id}/invoice?currency=rub`}
                          className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
                        >
                          <Receipt className="h-3.5 w-3.5" /> Счёт ₽
                        </a>
                        <a
                          href={`/api/manager-fulfillment-orders/${order.id}/invoice?currency=cny`}
                          className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
                        >
                          <Receipt className="h-3.5 w-3.5" /> Счёт ¥
                        </a>
                        <button
                          type="button"
                          onClick={() => handleEditOrder(order)}
                          disabled={busyOrderActionId === order.id}
                          className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Редактировать
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleArchiveOrder(order)}
                          disabled={busyOrderActionId === order.id}
                          className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-warning/30 hover:text-warning disabled:opacity-50"
                        >
                          {order.archivedAt ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                          {order.archivedAt ? "Из архива" : "В архив"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteOrder(order.id)}
                          disabled={busyOrderActionId === order.id}
                          className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-error/30 hover:text-error disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Удалить
                        </button>
                      </div>
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={() => setExpandedDetailsId(expandedDetailsId === order.id ? null : order.id)}
                        className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-text"
                      >
                        Детали (даты, приёмка по факту{order.printLogs.length > 0 ? ", печать" : ""})
                        <ChevronDown className={cn("h-3 w-3 transition-transform", expandedDetailsId === order.id && "rotate-180")} />
                      </button>
                      {expandedDetailsId === order.id && (
                        <div className="mt-1.5 space-y-2 rounded-lg border border-dashed border-border bg-bg p-2.5">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-[11px] text-text-secondary">Принято на складе</Label>
                              <Input
                                type="date"
                                value={order.receivedAt ? order.receivedAt.slice(0, 10) : ""}
                                onChange={(e) => handleUpdateOrderDates(order.id, { receivedAt: e.target.value || null })}
                                className="h-7 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-text-secondary">Плановая отгрузка</Label>
                              <Input
                                type="date"
                                value={order.plannedShipAt ? order.plannedShipAt.slice(0, 10) : ""}
                                onChange={(e) => handleUpdateOrderDates(order.id, { plannedShipAt: e.target.value || null })}
                                className="h-7 text-xs"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-text-secondary">Принято по факту (шт.)</Label>
                            {order.items.map((item) => (
                              <div key={item.id} className="flex items-center gap-2 text-xs text-text-secondary">
                                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                                <span>план {item.plannedQuantity} · факт</span>
                                <Input
                                  type="number"
                                  min={0}
                                  step="1"
                                  value={receiveDrafts[item.id] ?? (item.receivedQuantity ?? "")}
                                  onChange={(e) => setReceiveDrafts((c) => ({ ...c, [item.id]: e.target.value }))}
                                  onBlur={() => handleSaveReceivedQuantity(item.id)}
                                  disabled={busyReceiveItemId === item.id}
                                  className="h-6 w-16 text-xs"
                                />
                              </div>
                            ))}
                          </div>
                          {order.printLogs.length > 0 && (
                            <div>
                              <Label className="text-[11px] text-text-secondary">История печати наряда</Label>
                              <ul className="mt-0.5 space-y-0.5 text-[11px] text-text-secondary">
                                {order.printLogs.map((log) => (
                                  <li key={log.id}>
                                    {log.printedByManager.name} — {new Date(log.printedAt).toLocaleString("ru-RU")}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {order.items.map((item) => (
                      <div key={item.id} className="flex gap-2 rounded-lg border border-border bg-bg p-2.5">
                        {item.photoId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/manager-fulfillment-product-cards/photos/${item.photoId}`} alt={item.name} className="h-10 w-10 shrink-0 rounded-md object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface text-text-secondary">
                            <ImageIcon className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-medium text-text">{item.name}</div>
                            <span className="shrink-0 text-[11px] text-text-secondary">План: {item.plannedQuantity} шт.</span>
                          </div>
                          <div className="text-xs text-text-secondary">
                            Артикул: {item.sku || "—"}
                            {item.dimensions ? ` · Габариты: ${item.dimensions}` : ""}
                          </div>
                          <div className="mt-1.5 space-y-1">
                            {item.services.map((service) => (
                              <label key={service.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-surface">
                                <input
                                  type="checkbox"
                                  checked={Boolean(service.completedAt)}
                                  disabled={busyServiceCompletionId === service.id}
                                  onChange={(e) => handleToggleServiceCompleted(service.id, e.target.checked)}
                                />
                                <span className={cn("min-w-0 flex-1 truncate", service.completedAt && "text-text-secondary line-through")}>
                                  {service.name} ×{service.quantity}
                                </span>
                                <span className="shrink-0 text-xs text-text-secondary">
                                  {moneyCny(Number(service.priceCny) * service.quantity, Number(service.priceRub) * service.quantity)}
                                </span>
                                {service.completedAt && <span className="shrink-0 text-[11px] text-text-secondary">{service.completedByManager?.name}</span>}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}

                    {order.orderServices.length > 0 && (
                      <div className="rounded-lg border border-border bg-bg p-2.5">
                        <p className="mb-1.5 text-xs font-medium text-text-secondary">Услуги на партию целиком</p>
                        <div className="space-y-1">
                          {order.orderServices.map((s) => (
                            <div key={s.id} className="flex items-center justify-between text-sm">
                              <span className="min-w-0 flex-1 truncate text-text">
                                {s.name} ×{s.quantity}
                              </span>
                              <span className="shrink-0 text-xs text-text-secondary">{moneyCny(Number(s.priceCny) * s.quantity, Number(s.priceRub) * s.quantity)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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

export { FulfillmentOrdersList };
