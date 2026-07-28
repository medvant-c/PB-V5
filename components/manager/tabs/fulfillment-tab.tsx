"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Package, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

interface FulfillmentOrderRecord {
  id: string;
  displayId: number;
  totalRub: string;
  createdAt: string;
  client: { id: string; name: string; company: string | null };
  manager: { id: string; name: string };
  quote: { id: string; displayId: number; productName: string } | null;
  items: { id: string; name: string; priceRub: string; quantity: number }[];
}

function money(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

function ManagerFulfillmentTab() {
  const [services, setServices] = useState<ServiceItemRecord[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [orders, setOrders] = useState<FulfillmentOrderRecord[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  const [clientId, setClientId] = useState("");
  const [quoteId, setQuoteId] = useState("");
  const [clientQuotes, setClientQuotes] = useState<QuoteOption[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
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

  const total = useMemo(
    () => services.reduce((sum, s) => sum + Number(s.priceRub) * (Number(quantities[s.id]) || 0), 0),
    [services, quantities],
  );

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
    const items = services
      .map((s) => ({ serviceItemId: s.id, name: s.name, priceRub: Number(s.priceRub), quantity: Number(quantities[s.id]) || 0 }))
      .filter((item) => item.quantity > 0);
    if (items.length === 0) {
      setFormError("Отметьте количество хотя бы для одной услуги.");
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
      setQuantities({});
      setClientId("");
      setQuoteId("");
      await loadOrders();
    } catch {
      setFormError("Не удалось связаться с сервером.");
    } finally {
      setSaving(false);
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

      <Card className="p-4 space-y-3">
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

        <div className="space-y-1.5">
          {services.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border bg-bg px-3 py-2">
              <span className="min-w-0 flex-1 text-sm text-text">{s.name}</span>
              <span className="shrink-0 text-xs text-text-secondary">{s.priceRub} ₽/ед.</span>
              <Input
                type="number"
                min={0}
                step="1"
                placeholder="0"
                value={quantities[s.id] ?? ""}
                onChange={(e) => setQuantities((c) => ({ ...c, [s.id]: e.target.value }))}
                className="h-8 w-20 shrink-0 text-sm"
              />
            </div>
          ))}
        </div>

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
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-3xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-bg text-left text-xs text-text-secondary">
                <th className="px-3 py-1.5 font-medium">Дата</th>
                <th className="px-3 py-1.5 font-medium">Клиент</th>
                <th className="px-3 py-1.5 font-medium">Просчёт</th>
                <th className="px-3 py-1.5 font-medium">Услуги</th>
                <th className="px-3 py-1.5 font-medium">Менеджер</th>
                <th className="px-3 py-1.5 font-medium">Сумма, ₽</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-1.5 whitespace-nowrap text-text-secondary">
                    {new Date(order.createdAt).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-3 py-1.5 text-text">
                    {order.client.name}
                    {order.client.company ? ` (${order.client.company})` : ""}
                  </td>
                  <td className="px-3 py-1.5 text-text-secondary">{order.quote ? `№${order.quote.displayId}` : "—"}</td>
                  <td className="px-3 py-1.5 text-text-secondary">
                    {order.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}
                  </td>
                  <td className="px-3 py-1.5 text-text-secondary">{order.manager.name}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap font-medium text-text">{money(Number(order.totalRub))} ₽</td>
                </tr>
              ))}
            </tbody>
          </table>
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
