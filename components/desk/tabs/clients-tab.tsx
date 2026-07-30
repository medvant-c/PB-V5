"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Inbox,
  Loader2,
  Pencil,
  Plus,
  Search,
  SearchX,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { DeskFileTab, OrderDirection, OrderStatus } from "@/generated/prisma/enums";
import { FileUploadPanel } from "@/components/desk/file-upload-panel";
import { EmptyState } from "@/components/desk/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DIRECTION_LABELS, ORDER_DIRECTIONS } from "@/lib/order-directions";
import { STATUS_BADGE_CLASSES, STATUS_DOT_COLOR, STATUS_LABELS } from "@/lib/order-status";
import { cn } from "@/lib/utils";
import { formatPhoneMask } from "@/lib/phone";

const ALL_DIRECTIONS_VALUE = "__all__";

interface ClientRecord {
  id: string;
  displayId: number;
  name: string;
  email: string;
  phone: string | null;
  country: string | null;
  city: string | null;
  createdAt: string;
  activated: boolean;
  active: boolean;
  unseenOrderCount: number;
}

interface OrderStatusEventRecord {
  id: string;
  status: OrderStatus;
  note: string | null;
  createdAt: string;
}

interface OrderRecord {
  id: string;
  direction: string;
  title: string;
  price: string | null;
  status: OrderStatus;
  seenByManager: boolean;
  createdAt: string;
  events: OrderStatusEventRecord[];
  serviceCatalogItem: { code: string } | null;
}

interface ServiceCatalogItemRecord {
  id: string;
  code: string;
  direction: OrderDirection;
  name: string;
  price: string;
}

interface SearchOrderRecord {
  id: string;
  direction: string;
  title: string;
  price: string | null;
  status: OrderStatus;
  createdAt: string;
  client: {
    id: string;
    displayId: number;
    name: string;
    email: string;
    phone: string | null;
    country: string | null;
    city: string | null;
  };
  serviceCatalogItem: { code: string } | null;
}

type SortField = "date" | "price" | "product";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

// Best-effort — most prices are plain numbers with a currency suffix
// ("8 000 ₽"), but some are free text ("по расчёту", "3 бесплатно, далее
// 1 000 ₽"). Those without a parseable number just sort/discount as 0
// rather than crashing anything.
function priceToNumber(price: string | null): number {
  if (!price) return 0;
  const match = price.match(/[\d\s]+/);
  if (!match) return 0;
  return parseInt(match[0].replace(/\s/g, ""), 10) || 0;
}

// Replaces the first numeric chunk in a price string with a discounted
// value, preserving whatever text/currency symbol surrounds it. Returns
// null if the price has no parseable number (manager should edit manually
// in that case — e.g. "по расчёту").
function applyPercentDiscount(price: string, percent: number): string | null {
  const match = price.match(/[\d\s]+/);
  if (!match) return null;
  const numeric = parseInt(match[0].replace(/\s/g, ""), 10);
  if (!Number.isFinite(numeric)) return null;
  const discounted = Math.round(numeric * (1 - percent / 100));
  return price.replace(match[0], discounted.toLocaleString("ru-RU"));
}

type OrderSectionId = "status" | "price" | "history" | "files";

// A single open order used to reveal status/price/history/files all at
// once — 8+ interactive controls visible simultaneously. Collapsing them
// into an accordion (one sub-section open at a time) keeps the manager
// looking at whatever they actually came to do.
function OrderSection({
  label,
  summary,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  summary?: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left">
        <span className="text-xs font-semibold text-text-secondary">{label}</span>
        <span className="flex items-center gap-2">
          {summary}
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-text-secondary transition-transform", isOpen && "rotate-180")} />
        </span>
      </button>
      {isOpen && <div className="space-y-2 border-t border-border p-3">{children}</div>}
    </div>
  );
}

function ClientsTab() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientCountry, setNewClientCountry] = useState("");
  const [newClientCity, setNewClientCity] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const [editingClient, setEditingClient] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editCity, setEditCity] = useState("");
  const [savingClient, setSavingClient] = useState(false);
  const [editClientError, setEditClientError] = useState<string | null>(null);
  const [togglingActive, setTogglingActive] = useState(false);

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [expandedOrderSection, setExpandedOrderSection] = useState<OrderSectionId | null>(null);

  const [newOrderDirection, setNewOrderDirection] = useState(ORDER_DIRECTIONS[0]);
  const [catalogItems, setCatalogItems] = useState<ServiceCatalogItemRecord[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  const [showNewServiceForm, setShowNewServiceForm] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [creatingService, setCreatingService] = useState(false);
  const [newServiceError, setNewServiceError] = useState<string | null>(null);

  const [statusDrafts, setStatusDrafts] = useState<Record<string, { status: OrderStatus; note: string }>>({});
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);

  const [editingPriceOrderId, setEditingPriceOrderId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [discountDraft, setDiscountDraft] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  const [allOrders, setAllOrders] = useState<SearchOrderRecord[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDirection, setSearchDirection] = useState("");
  const [searchDateFrom, setSearchDateFrom] = useState("");
  const [searchDateTo, setSearchDateTo] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const loadClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const res = await fetch("/api/desk-clients");
      const data = await res.json();
      if (res.ok) setClients(data.clients);
    } finally {
      setLoadingClients(false);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const loadAllOrders = useCallback(async () => {
    setLoadingSearch(true);
    try {
      const res = await fetch("/api/desk-search");
      const data = await res.json();
      if (res.ok) setAllOrders(data.orders);
    } finally {
      setLoadingSearch(false);
    }
  }, []);

  useEffect(() => {
    loadAllOrders();
  }, [loadAllOrders]);

  const isFilterActive = Boolean(searchQuery.trim() || searchDirection || searchDateFrom || searchDateTo);

  const visibleOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const from = searchDateFrom ? new Date(`${searchDateFrom}T00:00:00`) : null;
    const to = searchDateTo ? new Date(`${searchDateTo}T23:59:59.999`) : null;

    const filtered = allOrders.filter((order) => {
      if (searchDirection && order.direction !== searchDirection) return false;
      const createdAt = new Date(order.createdAt);
      if (from && createdAt < from) return false;
      if (to && createdAt > to) return false;
      if (!q) return true;
      const haystack = [order.client.name, order.client.email, order.title, order.serviceCatalogItem?.code ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sortField === "price") cmp = priceToNumber(a.price) - priceToNumber(b.price);
      else cmp = a.title.localeCompare(b.title, "ru");
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [allOrders, searchQuery, searchDirection, searchDateFrom, searchDateTo, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function clearSearch() {
    setSearchQuery("");
    setSearchDirection("");
    setSearchDateFrom("");
    setSearchDateTo("");
  }

  function jumpToOrder(order: SearchOrderRecord) {
    setSelectedClientId(order.client.id);
    setExpandedOrderId(order.id);
  }

  const loadOrders = useCallback(async (clientId: string) => {
    setLoadingOrders(true);
    try {
      const res = await fetch(`/api/desk-orders?clientId=${clientId}`);
      const data = await res.json();
      if (res.ok) setOrders(data.orders);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  const loadCatalog = useCallback(async (direction: string) => {
    setLoadingCatalog(true);
    try {
      const res = await fetch(`/api/desk-service-catalog?direction=${direction}`);
      const data = await res.json();
      if (res.ok) {
        setCatalogItems(data.items);
        setSelectedServiceId(data.items[0]?.id ?? "");
      }
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog(newOrderDirection);
    setShowNewServiceForm(false);
  }, [newOrderDirection, loadCatalog]);

  useEffect(() => {
    if (selectedClientId) loadOrders(selectedClientId);
    else setOrders([]);
    setExpandedOrderId(null);
    setEditingClient(false);
  }, [selectedClientId, loadOrders]);

  async function handleCreateClient(event: React.FormEvent) {
    event.preventDefault();
    if (creatingClient) return;
    setCreatingClient(true);
    setClientError(null);
    try {
      const res = await fetch("/api/desk-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newClientName,
          email: newClientEmail,
          phone: newClientPhone,
          country: newClientCountry,
          city: newClientCity,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setClientError(data.error ?? "Не удалось создать клиента.");
        return;
      }
      setNewClientName("");
      setNewClientEmail("");
      setNewClientPhone("");
      setNewClientCountry("");
      setNewClientCity("");
      setShowNewClientForm(false);
      await loadClients();
      setSelectedClientId(data.client.id);
    } catch {
      setClientError("Не удалось связаться с сервером.");
    } finally {
      setCreatingClient(false);
    }
  }

  function openEditClient() {
    if (!selectedClient) return;
    setEditName(selectedClient.name);
    setEditPhone(selectedClient.phone ?? "");
    setEditCountry(selectedClient.country ?? "");
    setEditCity(selectedClient.city ?? "");
    setEditClientError(null);
    setEditingClient(true);
  }

  async function handleSaveClientEdit() {
    if (!selectedClientId || savingClient) return;
    setSavingClient(true);
    setEditClientError(null);
    try {
      const res = await fetch(`/api/desk-clients/${selectedClientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, phone: editPhone, country: editCountry, city: editCity }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditClientError(data.error ?? "Не удалось сохранить.");
        return;
      }
      setEditingClient(false);
      await loadClients();
      loadAllOrders();
    } catch {
      setEditClientError("Не удалось связаться с сервером.");
    } finally {
      setSavingClient(false);
    }
  }

  async function handleToggleActive() {
    if (!selectedClient || togglingActive) return;
    setTogglingActive(true);
    try {
      const res = await fetch(`/api/desk-clients/${selectedClient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !selectedClient.active }),
      });
      if (res.ok) await loadClients();
    } finally {
      setTogglingActive(false);
    }
  }

  async function handleCreateOrder(event: React.FormEvent) {
    event.preventDefault();
    if (creatingOrder || !selectedClientId || !selectedServiceId) return;
    setCreatingOrder(true);
    setOrderError(null);
    try {
      const res = await fetch("/api/desk-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: selectedClientId, serviceCatalogItemId: selectedServiceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOrderError(data.error ?? "Не удалось создать заказ.");
        return;
      }
      await loadOrders(selectedClientId);
      loadAllOrders();
    } catch {
      setOrderError("Не удалось связаться с сервером.");
    } finally {
      setCreatingOrder(false);
    }
  }

  async function handleCreateService() {
    if (creatingService) return;
    setCreatingService(true);
    setNewServiceError(null);
    try {
      const res = await fetch("/api/desk-service-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction: newOrderDirection, name: newServiceName, price: newServicePrice }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNewServiceError(data.error ?? "Не удалось добавить услугу.");
        return;
      }
      setNewServiceName("");
      setNewServicePrice("");
      setShowNewServiceForm(false);
      await loadCatalog(newOrderDirection);
      setSelectedServiceId(data.item.id);
    } catch {
      setNewServiceError("Не удалось связаться с сервером.");
    } finally {
      setCreatingService(false);
    }
  }

  async function handleExpandOrder(order: OrderRecord) {
    const opening = expandedOrderId !== order.id;
    setExpandedOrderId(opening ? order.id : null);
    setEditingPriceOrderId(null);
    setExpandedOrderSection(null);

    if (opening && !order.seenByManager) {
      // Fire-and-forget: clear the "new" badge as soon as the manager
      // looks at it, without waiting on the request before the UI expands.
      fetch(`/api/desk-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markSeen: true }),
      }).then(() => {
        setOrders((current) => current.map((o) => (o.id === order.id ? { ...o, seenByManager: true } : o)));
        setClients((current) =>
          current.map((c) =>
            c.id === selectedClientId ? { ...c, unseenOrderCount: Math.max(0, c.unseenOrderCount - 1) } : c,
          ),
        );
        loadAllOrders();
      });
    }
  }

  async function handleUpdateStatus(orderId: string) {
    if (updatingOrderId) return;
    const draft = statusDrafts[orderId];
    if (!draft) return;
    setUpdatingOrderId(orderId);
    try {
      const res = await fetch(`/api/desk-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: draft.status, note: draft.note }),
      });
      if (res.ok && selectedClientId) {
        setStatusDrafts((current) => ({ ...current, [orderId]: { status: draft.status, note: "" } }));
        await loadOrders(selectedClientId);
        loadAllOrders();
      }
    } finally {
      setUpdatingOrderId(null);
    }
  }

  function openPriceEdit(order: OrderRecord) {
    setEditingPriceOrderId(order.id);
    setPriceDraft(order.price ?? "");
    setDiscountDraft("");
    setPriceError(null);
  }

  function applyDiscountToDraft(currentPrice: string) {
    const percent = parseFloat(discountDraft);
    if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) {
      setPriceError("Укажите процент от 1 до 99.");
      return;
    }
    const result = applyPercentDiscount(currentPrice, percent);
    if (!result) {
      setPriceError("Не удалось распознать число в цене — введите итоговую цену вручную.");
      return;
    }
    setPriceError(null);
    setPriceDraft(result);
  }

  async function handleSavePrice(orderId: string) {
    if (savingPrice || !priceDraft.trim()) return;
    setSavingPrice(true);
    setPriceError(null);
    try {
      const res = await fetch(`/api/desk-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: priceDraft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPriceError(data.error ?? "Не удалось сохранить цену.");
        return;
      }
      setEditingPriceOrderId(null);
      if (selectedClientId) await loadOrders(selectedClientId);
      loadAllOrders();
    } catch {
      setPriceError("Не удалось связаться с сервером.");
    } finally {
      setSavingPrice(false);
    }
  }

  async function handleDeleteOrder(orderId: string) {
    if (deletingOrderId) return;
    setDeletingOrderId(orderId);
    try {
      const res = await fetch(`/api/desk-orders/${orderId}`, { method: "DELETE" });
      if (res.ok) {
        if (selectedClientId) await loadOrders(selectedClientId);
        await loadClients();
        loadAllOrders();
      }
    } finally {
      setDeletingOrderId(null);
    }
  }

  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  const columns: { field: SortField; label: string }[] = [
    { field: "date", label: "Дата заявки" },
    { field: "product", label: "Услуга" },
    { field: "price", label: "Сумма" },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-text-secondary">Поиск и фильтр по всем заказам</h3>
          {isFilterActive && (
            <button
              type="button"
              onClick={clearSearch}
              className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-error"
            >
              <X className="h-3.5 w-3.5" /> Сбросить фильтр
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="order-search-query">Клиент, email, услуга или код</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <Input
                id="order-search-query"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Начните вводить..."
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="order-search-direction">Направление</Label>
            <Select
              value={searchDirection || ALL_DIRECTIONS_VALUE}
              onValueChange={(value) => setSearchDirection(value === ALL_DIRECTIONS_VALUE ? "" : value)}
            >
              <SelectTrigger id="order-search-direction" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_DIRECTIONS_VALUE}>Все продукты</SelectItem>
                {ORDER_DIRECTIONS.map((direction) => (
                  <SelectItem key={direction} value={direction}>
                    {DIRECTION_LABELS[direction]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="order-search-from">С даты</Label>
              <input
                id="order-search-from"
                type="date"
                value={searchDateFrom}
                onChange={(e) => setSearchDateFrom(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm text-text outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="order-search-to">По дату</Label>
              <input
                id="order-search-to"
                type="date"
                value={searchDateTo}
                onChange={(e) => setSearchDateTo(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm text-text outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-4 rounded-xl border border-border bg-surface p-3">
          <div>
            <h2 className="text-sm font-bold text-text">Клиенты</h2>
            {loadingClients ? (
              <p className="mt-2 text-xs text-text-secondary">Загрузка…</p>
            ) : clients.length === 0 ? (
              <div className="mt-2">
                <EmptyState icon={UserRound} message="Клиентов пока нет — добавьте первого кнопкой ниже." compact />
              </div>
            ) : (
              <ul className="mt-2 space-y-1">
                {clients.map((client) => (
                  <li key={client.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedClientId(client.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        selectedClientId === client.id
                          ? "bg-primary/10 text-primary"
                          : "text-text-secondary hover:bg-black/3 hover:text-text",
                        !client.active && "opacity-50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                          selectedClientId === client.id ? "bg-primary text-white" : "bg-primary/10 text-primary",
                        )}
                      >
                        {client.name.trim().charAt(0).toUpperCase() || "?"}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="block truncate font-medium">
                          <span className="text-text-secondary">№{client.displayId}</span> {client.name}
                        </span>
                        <span className="block truncate text-xs opacity-80">{client.email}</span>
                      </span>
                      {client.unseenOrderCount > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-error px-1.5 text-[10px] font-bold text-white">
                          {client.unseenOrderCount}
                        </span>
                      )}
                      {!client.active && (
                        <span className="shrink-0 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] text-text-secondary">
                          деактивирован
                        </span>
                      )}
                      {client.active && !client.activated && (
                        <span className="shrink-0 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] text-text-secondary">
                          не активирован
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selectedClientId && (
            <button
              type="button"
              onClick={() => setSelectedClientId(null)}
              className="text-xs font-medium text-primary hover:underline"
            >
              ← Ко всем заказам
            </button>
          )}

          {!showNewClientForm ? (
            <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => setShowNewClientForm(true)}>
              <Plus className="h-4 w-4" /> Новый клиент
            </Button>
          ) : (
            <form onSubmit={handleCreateClient} className="space-y-2 rounded-xl border border-dashed border-border p-3">
              <p className="text-xs font-semibold text-text-secondary">Новый клиент</p>
              <Input placeholder="Имя" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} required />
              <Input
                type="email"
                placeholder="Email"
                value={newClientEmail}
                onChange={(e) => setNewClientEmail(e.target.value)}
                required
              />
              <Input
                placeholder="+7 (___) ___-__-__"
                value={newClientPhone}
                onChange={(e) => setNewClientPhone(formatPhoneMask(e.target.value, newClientPhone))}
                required
              />
              <Input placeholder="Страна" value={newClientCountry} onChange={(e) => setNewClientCountry(e.target.value)} required />
              <Input placeholder="Город" value={newClientCity} onChange={(e) => setNewClientCity(e.target.value)} required />
              {clientError && <p className="text-xs text-error">{clientError}</p>}
              <div className="flex gap-2">
                <Button type="submit" size="sm" className="flex-1" disabled={creatingClient}>
                  {creatingClient ? <Loader2 className="h-4 w-4 animate-spin" /> : "Добавить"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewClientForm(false)}>
                  Отмена
                </Button>
              </div>
            </form>
          )}
        </div>

        <div className="min-w-0">
          {!selectedClient ? (
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-text">Все заказы</h2>
              {loadingSearch ? (
                <p className="text-sm text-text-secondary">Загрузка…</p>
              ) : visibleOrders.length === 0 ? (
                <EmptyState
                  icon={SearchX}
                  message={isFilterActive ? "По этому фильтру ничего не нашлось — попробуйте изменить условия." : "Заказов пока нет."}
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[880px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border bg-bg text-left text-xs text-text-secondary">
                        {columns.map((col) => (
                          <th key={col.field} className="px-3 py-2 font-medium">
                            <button
                              type="button"
                              onClick={() => toggleSort(col.field)}
                              className="inline-flex items-center gap-1 hover:text-text"
                            >
                              {col.label}
                              {sortField === col.field &&
                                (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                            </button>
                          </th>
                        ))}
                        <th className="px-3 py-2 font-medium">ID клиента</th>
                        <th className="px-3 py-2 font-medium">Имя</th>
                        <th className="px-3 py-2 font-medium">Телефон</th>
                        <th className="px-3 py-2 font-medium">Страна</th>
                        <th className="px-3 py-2 font-medium">Город</th>
                        <th className="px-3 py-2 font-medium">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleOrders.map((order) => (
                        <tr
                          key={order.id}
                          onClick={() => jumpToOrder(order)}
                          className="cursor-pointer border-b border-border last:border-0 hover:bg-black/3"
                        >
                          <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{formatDate(order.createdAt)}</td>
                          <td className="px-3 py-2">
                            {order.serviceCatalogItem && (
                              <span className="mr-1.5 font-mono text-xs text-text-secondary">{order.serviceCatalogItem.code}</span>
                            )}
                            <span className="text-text">{order.title}</span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap font-semibold text-primary">{order.price ?? "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-text-secondary">№{order.client.displayId}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-text">{order.client.name}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{order.client.phone ?? "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{order.client.country ?? "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{order.client.city ?? "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATUS_BADGE_CLASSES[order.status])}>
                              {STATUS_LABELS[order.status]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                {!editingClient ? (
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-text">
                        <span className="text-text-secondary">№{selectedClient.displayId}</span> {selectedClient.name}
                        {!selectedClient.active && <span className="ml-2 text-xs font-normal text-error">деактивирован</span>}
                      </h3>
                      <p className="text-xs text-text-secondary">
                        {selectedClient.email}
                        {selectedClient.phone ? ` · ${selectedClient.phone}` : ""}
                        {selectedClient.country || selectedClient.city
                          ? ` · ${[selectedClient.country, selectedClient.city].filter(Boolean).join(", ")}`
                          : ""}{" "}
                        · {selectedClient.activated ? "аккаунт активирован" : "ждёт активации по письму"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={openEditClient}
                        aria-label="Редактировать клиента"
                        className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-black/5 hover:text-primary"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleToggleActive}
                        disabled={togglingActive}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                          selectedClient.active
                            ? "border-border text-text-secondary hover:border-error/30 hover:text-error"
                            : "border-success/30 text-success",
                        )}
                      >
                        {togglingActive ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : selectedClient.active ? (
                          "Деактивировать"
                        ) : (
                          "Активировать"
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 rounded-lg bg-bg p-3">
                    <p className="text-xs font-semibold text-text-secondary">Редактирование клиента</p>
                    <Input placeholder="Имя" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <Input
                      placeholder="+7 (___) ___-__-__"
                      value={editPhone}
                      onChange={(e) => setEditPhone(formatPhoneMask(e.target.value, editPhone))}
                    />
                    <Input placeholder="Страна" value={editCountry} onChange={(e) => setEditCountry(e.target.value)} />
                    <Input placeholder="Город" value={editCity} onChange={(e) => setEditCity(e.target.value)} />
                    {editClientError && <p className="text-xs text-error">{editClientError}</p>}
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={handleSaveClientEdit} disabled={savingClient}>
                        {savingClient ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditingClient(false)}>
                        Отмена
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleCreateOrder} className="space-y-2 rounded-xl border border-dashed border-border p-3">
                <p className="text-xs font-semibold text-text-secondary">Добавить услугу клиенту</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select
                    value={newOrderDirection}
                    onValueChange={(value) => setNewOrderDirection(value as (typeof ORDER_DIRECTIONS)[number])}
                  >
                    <SelectTrigger className="w-full sm:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDER_DIRECTIONS.map((direction) => (
                        <SelectItem key={direction} value={direction}>
                          {DIRECTION_LABELS[direction]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedServiceId} onValueChange={setSelectedServiceId} disabled={loadingCatalog || catalogItems.length === 0}>
                    <SelectTrigger className="w-full flex-1">
                      <SelectValue placeholder={loadingCatalog ? "Загрузка…" : "Нет услуг в этом направлении"} />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.code} · {item.name} — {item.price}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!showNewServiceForm ? (
                  <button
                    type="button"
                    onClick={() => setShowNewServiceForm(true)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Такой услуги нет — добавить новую
                  </button>
                ) : (
                  <div className="space-y-2 rounded-lg bg-bg p-2.5">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        placeholder="Название услуги"
                        value={newServiceName}
                        onChange={(e) => setNewServiceName(e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        placeholder="Цена, например 8 000 ₽"
                        value={newServicePrice}
                        onChange={(e) => setNewServicePrice(e.target.value)}
                        className="sm:w-40"
                      />
                    </div>
                    {newServiceError && <p className="text-xs text-error">{newServiceError}</p>}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleCreateService}
                        disabled={creatingService || !newServiceName.trim() || !newServicePrice.trim()}
                      >
                        {creatingService ? <Loader2 className="h-4 w-4 animate-spin" /> : "Добавить в каталог"}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewServiceForm(false)}>
                        Отмена
                      </Button>
                    </div>
                  </div>
                )}

                {orderError && <p className="text-xs text-error">{orderError}</p>}
                <Button type="submit" size="sm" disabled={creatingOrder || !selectedServiceId}>
                  {creatingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Добавить клиенту
                </Button>
              </form>

              {loadingOrders ? (
                <p className="text-xs text-text-secondary">Загрузка заказов…</p>
              ) : orders.length === 0 ? (
                <EmptyState icon={Inbox} message="У клиента пока нет заказов — добавьте услугу формой выше." compact />
              ) : (
                <div className="space-y-2">
                  {orders.map((order) => {
                    const isOpen = expandedOrderId === order.id;
                    const draft = statusDrafts[order.id] ?? { status: order.status, note: "" };
                    return (
                      <div key={order.id} className="rounded-xl border border-border bg-surface">
                        <button
                          type="button"
                          onClick={() => handleExpandOrder(order)}
                          className="flex w-full items-center justify-between gap-3 p-3 text-left"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-medium text-text">
                              {!order.seenByManager && (
                                <span className="shrink-0 rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-bold text-error">
                                  Новое
                                </span>
                              )}
                              <span className="truncate">
                                {order.serviceCatalogItem && (
                                  <span className="mr-1.5 font-mono text-xs text-text-secondary">{order.serviceCatalogItem.code}</span>
                                )}
                                {order.title}
                                {order.price ? <span className="ml-2 text-text-secondary">· {order.price}</span> : null}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-text-secondary">
                              <span>{DIRECTION_LABELS[order.direction as keyof typeof DIRECTION_LABELS] ?? order.direction}</span>
                              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_BADGE_CLASSES[order.status])}>
                                {STATUS_LABELS[order.status]}
                              </span>
                            </div>
                          </div>
                          <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-secondary transition-transform", isOpen && "rotate-180")} />
                        </button>

                        {isOpen && (
                          <div className="space-y-2 border-t border-border p-3">
                            <OrderSection
                              label="Статус"
                              summary={
                                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_BADGE_CLASSES[order.status])}>
                                  {STATUS_LABELS[order.status]}
                                </span>
                              }
                              isOpen={expandedOrderSection === "status"}
                              onToggle={() => setExpandedOrderSection((s) => (s === "status" ? null : "status"))}
                            >
                              <div className="flex flex-col gap-2 sm:flex-row">
                                <Select
                                  value={draft.status}
                                  onValueChange={(value) =>
                                    setStatusDrafts((current) => ({
                                      ...current,
                                      [order.id]: { ...draft, status: value as OrderStatus },
                                    }))
                                  }
                                >
                                  <SelectTrigger className="w-full sm:w-48">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Object.values(OrderStatus).map((status) => (
                                      <SelectItem key={status} value={status}>
                                        <span className="flex items-center gap-2">
                                          <span
                                            className="h-2 w-2 shrink-0 rounded-full"
                                            style={{ backgroundColor: STATUS_DOT_COLOR[status] }}
                                          />
                                          {STATUS_LABELS[status]}
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Input
                                  placeholder="Комментарий (необязательно)"
                                  value={draft.note}
                                  onChange={(e) =>
                                    setStatusDrafts((current) => ({ ...current, [order.id]: { ...draft, note: e.target.value } }))
                                  }
                                  className="flex-1"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => handleUpdateStatus(order.id)}
                                  disabled={updatingOrderId === order.id}
                                >
                                  {updatingOrderId === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Обновить"}
                                </Button>
                              </div>
                            </OrderSection>

                            <OrderSection
                              label="Цена"
                              summary={<span className="text-xs text-text-secondary">{order.price ?? "не указана"}</span>}
                              isOpen={expandedOrderSection === "price"}
                              onToggle={() => setExpandedOrderSection((s) => (s === "price" ? null : "price"))}
                            >
                              {editingPriceOrderId !== order.id ? (
                                <div className="flex items-center gap-2">
                                  <Button type="button" size="sm" variant="outline" onClick={() => openPriceEdit(order)}>
                                    Изменить цену / скидка
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <button
                                        type="button"
                                        disabled={deletingOrderId === order.id}
                                        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-error hover:text-error")}
                                      >
                                        {deletingOrderId === order.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-4 w-4" />
                                        )}
                                        Удалить услугу
                                      </button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Удалить услугу?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          «{order.title}» будет удалена из заказов клиента {selectedClient?.name}. Историю статусов
                                          и приложенные файлы тоже не получится восстановить.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Отмена</AlertDialogCancel>
                                        <AlertDialogAction variant="danger" onClick={() => handleDeleteOrder(order.id)}>
                                          Удалить
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              ) : (
                                <div className="space-y-2 rounded-lg bg-surface p-2.5">
                                  <div className="flex flex-col gap-2 sm:flex-row">
                                    <Input
                                      placeholder="% скидки"
                                      value={discountDraft}
                                      onChange={(e) => setDiscountDraft(e.target.value)}
                                      className="sm:w-24"
                                    />
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => applyDiscountToDraft(priceDraft)}
                                      disabled={!discountDraft.trim()}
                                    >
                                      Применить %
                                    </Button>
                                    <Input
                                      placeholder="Итоговая цена"
                                      value={priceDraft}
                                      onChange={(e) => setPriceDraft(e.target.value)}
                                      className="flex-1"
                                    />
                                  </div>
                                  {priceError && <p className="text-xs text-error">{priceError}</p>}
                                  <div className="flex gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => handleSavePrice(order.id)}
                                      disabled={savingPrice || !priceDraft.trim()}
                                    >
                                      {savingPrice ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить цену"}
                                    </Button>
                                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditingPriceOrderId(null)}>
                                      Отмена
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </OrderSection>

                            <OrderSection
                              label="История статусов"
                              summary={<span className="text-xs text-text-secondary">{order.events.length}</span>}
                              isOpen={expandedOrderSection === "history"}
                              onToggle={() => setExpandedOrderSection((s) => (s === "history" ? null : "history"))}
                            >
                              <ul className="space-y-1 text-xs text-text-secondary">
                                {order.events.map((event) => (
                                  <li key={event.id}>
                                    {formatDate(event.createdAt)} — {STATUS_LABELS[event.status]}
                                    {event.note ? ` (${event.note})` : ""}
                                  </li>
                                ))}
                              </ul>
                            </OrderSection>

                            <OrderSection
                              label="Документы заказа"
                              isOpen={expandedOrderSection === "files"}
                              onToggle={() => setExpandedOrderSection((s) => (s === "files" ? null : "files"))}
                            >
                              <FileUploadPanel tab={DeskFileTab.orders} relatedId={order.id} />
                            </OrderSection>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { ClientsTab };
