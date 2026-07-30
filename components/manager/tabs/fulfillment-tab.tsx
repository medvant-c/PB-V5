"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, Loader2, Package, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface ServiceItemRecord {
  id: string;
  name: string;
  priceRub: string;
}

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
}

interface QuoteOption {
  id: string;
  displayId: number;
  productName: string;
}

interface OrderServiceRecord {
  id: string;
  name: string;
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
  services: OrderServiceRecord[];
}

interface FulfillmentOrderRecord {
  id: string;
  displayId: number;
  totalRub: string;
  createdAt: string;
  client: { id: string; name: string; company: string | null };
  manager: { id: string; name: string };
  quote: { id: string; displayId: number; productName: string } | null;
  items: OrderItemRecord[];
}

// One draft товар block in the "Новый заказ" form — services keyed by
// FulfillmentServiceItem.id, same "quantity string, 0/blank = not
// selected" convention the flat pre-товар form already used.
interface DraftItem {
  key: string;
  name: string;
  sku: string;
  dimensions: string;
  quantities: Record<string, string>;
}

function money(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

function blankDraftItem(): DraftItem {
  return { key: crypto.randomUUID(), name: "", sku: "", dimensions: "", quantities: {} };
}

function ManagerFulfillmentTab() {
  const [services, setServices] = useState<ServiceItemRecord[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [orders, setOrders] = useState<FulfillmentOrderRecord[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [busyServiceCompletionId, setBusyServiceCompletionId] = useState<string | null>(null);

  const [clientId, setClientId] = useState("");
  const [quoteId, setQuoteId] = useState("");
  const [clientQuotes, setClientQuotes] = useState<QuoteOption[]>([]);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([blankDraftItem()]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);

  const loadServices = useCallback(async () => {
    const res = await fetch("/api/manager-fulfillment-services");
    const data = await res.json();
    if (res.ok) setServices(data.items);
  }, []);

  const loadClients = useCallback(async () => {
    const res = await fetch("/api/manager-clients");
    const data = await res.json();
    if (res.ok) setClients(data.clients);
  }, []);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const res = await fetch("/api/manager-fulfillment-orders");
      const data = await res.json();
      if (res.ok) setOrders(data.orders);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    loadServices();
    loadClients();
    loadOrders();
  }, [loadServices, loadClients, loadOrders]);

  useEffect(() => {
    if (!clientId) {
      setClientQuotes([]);
      setQuoteId("");
      return;
    }
    fetch(`/api/manager-quotes?clientId=${clientId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setClientQuotes(data?.quotes ?? []));
  }, [clientId]);

  function itemTotal(item: DraftItem): number {
    return services.reduce((sum, s) => sum + Number(s.priceRub) * (Number(item.quantities[s.id]) || 0), 0);
  }

  const total = useMemo(
    () =>
      draftItems.reduce(
        (orderSum, item) =>
          orderSum + services.reduce((itemSum, s) => itemSum + Number(s.priceRub) * (Number(item.quantities[s.id]) || 0), 0),
        0,
      ),
    [draftItems, services],
  );

  function updateDraftItem(key: string, patch: Partial<DraftItem>) {
    setDraftItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function updateDraftItemQuantity(key: string, serviceId: string, value: string) {
    setDraftItems((current) =>
      current.map((item) => (item.key === key ? { ...item, quantities: { ...item.quantities, [serviceId]: value } } : item)),
    );
  }

  function addDraftItem() {
    setDraftItems((current) => [...current, blankDraftItem()]);
  }

  function removeDraftItem(key: string) {
    setDraftItems((current) => (current.length > 1 ? current.filter((item) => item.key !== key) : current));
  }

  async function handleCreateClient() {
    if (!newClientName.trim() || !newClientPhone.trim()) return;
    setCreatingClient(true);
    try {
      const res = await fetch("/api/manager-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newClientName.trim(), phone: newClientPhone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Не удалось создать клиента.");
        return;
      }
      setNewClientName("");
      setNewClientPhone("");
      setShowNewClientForm(false);
      await loadClients();
      setClientId(data.client.id);
    } finally {
      setCreatingClient(false);
    }
  }

  async function handleSave() {
    if (!clientId) {
      setFormError("Выберите клиента.");
      return;
    }
    const items = draftItems
      .filter((item) => item.name.trim())
      .map((item) => ({
        name: item.name.trim(),
        sku: item.sku.trim() || undefined,
        dimensions: item.dimensions.trim() || undefined,
        services: services
          .map((s) => ({ serviceItemId: s.id, name: s.name, priceRub: Number(s.priceRub), quantity: Number(item.quantities[s.id]) || 0 }))
          .filter((service) => service.quantity > 0),
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
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/manager-fulfillment-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, quoteId: quoteId || null, items }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Не удалось сохранить заказ.");
        return;
      }
      setDraftItems([blankDraftItem()]);
      setClientId("");
      setQuoteId("");
      await loadOrders();
    } catch {
      setFormError("Не удалось связаться с сервером.");
    } finally {
      setSaving(false);
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

  // --- Service price-list management (collapsed by default) ---
  const [showServicePanel, setShowServicePanel] = useState(false);
  const [serviceDrafts, setServiceDrafts] = useState<Record<string, { name: string; priceRub: string }>>({});
  const [busyServiceId, setBusyServiceId] = useState<string | null>(null);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [servicePanelError, setServicePanelError] = useState<string | null>(null);

  async function handleSaveService(id: string, original: ServiceItemRecord) {
    const draft = serviceDrafts[id];
    if (!draft || (draft.name === original.name && draft.priceRub === original.priceRub)) return;
    setBusyServiceId(id);
    setServicePanelError(null);
    try {
      const res = await fetch(`/api/manager-fulfillment-services/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, priceRub: Number(draft.priceRub) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServicePanelError(data.error ?? "Не удалось сохранить услугу.");
        return;
      }
      await loadServices();
    } finally {
      setBusyServiceId(null);
    }
  }

  async function handleDeleteService(id: string) {
    if (!window.confirm("Удалить эту услугу из прайс-листа?")) return;
    setBusyServiceId(id);
    try {
      const res = await fetch(`/api/manager-fulfillment-services/${id}`, { method: "DELETE" });
      if (res.ok) await loadServices();
    } finally {
      setBusyServiceId(null);
    }
  }

  async function handleCreateService() {
    if (!newServiceName.trim() || !newServicePrice) return;
    setServicePanelError(null);
    const res = await fetch("/api/manager-fulfillment-services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newServiceName.trim(), priceRub: Number(newServicePrice) }),
    });
    const data = await res.json();
    if (!res.ok) {
      setServicePanelError(data.error ?? "Не удалось добавить услугу.");
      return;
    }
    setNewServiceName("");
    setNewServicePrice("");
    await loadServices();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-text">Фулфилмент</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Платные складские услуги по товару — приёмка, сортировка, проверка на брак, маркировка.
        </p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Клиент</Label>
              {!showNewClientForm && (
                <button type="button" onClick={() => setShowNewClientForm(true)} className="text-xs text-primary hover:underline">
                  + новый клиент
                </button>
              )}
            </div>
            {showNewClientForm ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input placeholder="Имя клиента" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} />
                  <Input placeholder="Телефон" value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={handleCreateClient} disabled={creatingClient}>
                    {creatingClient ? <Loader2 className="h-4 w-4 animate-spin" /> : "Создать"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewClientForm(false)}>
                    Отмена
                  </Button>
                </div>
              </div>
            ) : (
              <Select value={clientId} onValueChange={setClientId}>
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
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Просчёт (необязательно)</Label>
            <Select value={quoteId} onValueChange={setQuoteId} disabled={!clientId || clientQuotes.length === 0}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={clientId ? "Без привязки к просчёту" : "Сначала выберите клиента"} />
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
        </div>

        <div className="space-y-3">
          {draftItems.map((item, index) => (
            <div key={item.key} className="rounded-lg border border-border bg-bg p-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
                  <Input
                    placeholder={`Название товара ${draftItems.length > 1 ? `№${index + 1}` : ""}`}
                    value={item.name}
                    onChange={(e) => updateDraftItem(item.key, { name: e.target.value })}
                  />
                  <Input
                    placeholder="Артикул (необязательно)"
                    value={item.sku}
                    onChange={(e) => updateDraftItem(item.key, { sku: e.target.value })}
                  />
                  <Input
                    placeholder="Габариты (необязательно)"
                    value={item.dimensions}
                    onChange={(e) => updateDraftItem(item.key, { dimensions: e.target.value })}
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

              <div className="space-y-1.5">
                {services.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2">
                    <span className="min-w-0 flex-1 text-sm text-text">{s.name}</span>
                    <span className="shrink-0 text-xs text-text-secondary">{s.priceRub} ₽/ед.</span>
                    <Input
                      type="number"
                      min={0}
                      step="1"
                      placeholder="0"
                      value={item.quantities[s.id] ?? ""}
                      onChange={(e) => updateDraftItemQuantity(item.key, s.id, e.target.value)}
                      className="h-8 w-20 shrink-0 text-sm"
                    />
                  </div>
                ))}
              </div>
              <p className="text-right text-xs text-text-secondary">Товар: {money(itemTotal(item))} ₽</p>
            </div>
          ))}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={addDraftItem}>
          <Plus className="h-4 w-4" /> Добавить товар
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-sm font-bold text-text">Итого: {money(total)} ₽</p>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить заказ"}
          </Button>
        </div>
        {formError && <p className="text-xs text-error">{formError}</p>}
      </Card>

      {loadingOrders ? (
        <p className="text-sm text-text-secondary">Загрузка…</p>
      ) : orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-text-secondary">Заказов пока нет.</p>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => {
            const isOpen = expandedOrderId === order.id;
            const totalServices = order.items.reduce((sum, item) => sum + item.services.length, 0);
            const completedServices = order.items.reduce(
              (sum, item) => sum + item.services.filter((s) => s.completedAt).length,
              0,
            );
            return (
              <div key={order.id} className="rounded-xl border border-border bg-surface">
                <button
                  type="button"
                  onClick={() => setExpandedOrderId(isOpen ? null : order.id)}
                  className="flex w-full flex-wrap items-center gap-3 p-3 text-left"
                >
                  <span className="text-xs text-text-secondary">{new Date(order.createdAt).toLocaleDateString("ru-RU")}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                    №{order.displayId} · {order.client.name}
                    {order.client.company ? ` (${order.client.company})` : ""}
                  </span>
                  {order.quote && <span className="shrink-0 text-xs text-text-secondary">Просчёт №{order.quote.displayId}</span>}
                  <span className="shrink-0 text-xs text-text-secondary">
                    {order.items.length} тов. · {completedServices}/{totalServices} услуг
                  </span>
                  <span className="shrink-0 text-sm font-bold text-text">{money(Number(order.totalRub))} ₽</span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-secondary transition-transform", isOpen && "rotate-180")} />
                </button>

                {isOpen && (
                  <div className="space-y-3 border-t border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-secondary">Менеджер: {order.manager.name}</span>
                      <a
                        href={`/api/manager-fulfillment-orders/${order.id}/pdf`}
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
                      >
                        <Download className="h-3.5 w-3.5" /> Скачать наряд для склада
                      </a>
                    </div>
                    {order.items.map((item) => (
                      <div key={item.id} className="rounded-lg border border-border bg-bg p-2.5">
                        <div className="text-sm font-medium text-text">{item.name}</div>
                        {(item.sku || item.dimensions) && (
                          <div className="text-xs text-text-secondary">
                            {item.sku ? `Артикул: ${item.sku}` : ""}
                            {item.sku && item.dimensions ? " · " : ""}
                            {item.dimensions ? `Габариты: ${item.dimensions}` : ""}
                          </div>
                        )}
                        <div className="mt-1.5 space-y-1">
                          {item.services.map((service) => (
                            <label
                              key={service.id}
                              className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-surface"
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(service.completedAt)}
                                disabled={busyServiceCompletionId === service.id}
                                onChange={(e) => handleToggleServiceCompleted(service.id, e.target.checked)}
                              />
                              <span
                                className={cn("min-w-0 flex-1 truncate", service.completedAt && "text-text-secondary line-through")}
                              >
                                {service.name} ×{service.quantity}
                              </span>
                              <span className="shrink-0 text-xs text-text-secondary">
                                {money(Number(service.priceRub) * service.quantity)} ₽
                              </span>
                              {service.completedAt && (
                                <span className="shrink-0 text-[11px] text-text-secondary">{service.completedByManager?.name}</span>
                              )}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setShowServicePanel((v) => !v)}
          className="flex items-center gap-1 text-xs font-semibold text-text-secondary hover:text-text"
        >
          <Package className="h-3.5 w-3.5" />
          {showServicePanel ? "Скрыть прайс-лист услуг" : "Управлять прайс-листом услуг"}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showServicePanel ? "rotate-180" : ""}`} />
        </button>
        {showServicePanel && (
          <div className="mt-3 space-y-1.5">
            {services.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border bg-bg px-2.5 py-1.5">
                <Input
                  value={serviceDrafts[s.id]?.name ?? s.name}
                  onChange={(e) => setServiceDrafts((c) => ({ ...c, [s.id]: { name: e.target.value, priceRub: c[s.id]?.priceRub ?? s.priceRub } }))}
                  onBlur={() => handleSaveService(s.id, s)}
                  disabled={busyServiceId === s.id}
                  className="h-8 min-w-0 flex-1 text-sm"
                />
                <Input
                  type="number"
                  value={serviceDrafts[s.id]?.priceRub ?? s.priceRub}
                  onChange={(e) => setServiceDrafts((c) => ({ ...c, [s.id]: { name: c[s.id]?.name ?? s.name, priceRub: e.target.value } }))}
                  onBlur={() => handleSaveService(s.id, s)}
                  disabled={busyServiceId === s.id}
                  className="h-8 w-24 shrink-0 text-sm"
                />
                <button
                  type="button"
                  onClick={() => handleDeleteService(s.id)}
                  disabled={busyServiceId === s.id}
                  className="shrink-0 text-text-secondary hover:text-error disabled:opacity-50"
                  aria-label="Удалить услугу"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <Input placeholder="Название услуги" value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} className="h-8 text-sm" />
              <Input
                type="number"
                placeholder="₽"
                value={newServicePrice}
                onChange={(e) => setNewServicePrice(e.target.value)}
                className="h-8 w-24 shrink-0 text-sm"
              />
              <Button type="button" size="sm" onClick={handleCreateService}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {servicePanelError && <p className="text-xs text-error">{servicePanelError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export { ManagerFulfillmentTab };
