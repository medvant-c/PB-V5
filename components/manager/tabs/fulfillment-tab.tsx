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
  Search,
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

type PeriodFilter = "all" | "day" | "week" | "month" | "year";

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "day", label: "День" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "year", label: "Год" },
];

// Start of the period containing `now` — "день" is today, "неделя" is the
// last 7 days, etc. (rolling windows, not calendar-boundary weeks/months),
// same simple "how far back" filter feel as elsewhere in this app.
function periodStart(period: PeriodFilter): Date | null {
  if (period === "all") return null;
  const days = { day: 1, week: 7, month: 30, year: 365 }[period];
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

const CODE_RE = /^\d{4}[A-Za-z]{2}$/;

interface ServiceItemRecord {
  id: string;
  name: string;
  priceCny: string;
  priceRub: string;
}

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
  fulfillmentCode: string | null;
  createdByManagerId: string | null;
  createdByManager: { name: string } | null;
}

interface QuoteOption {
  id: string;
  displayId: number;
  productName: string;
}

interface ProductCardServiceRecord {
  id: string;
  serviceItemId: string | null;
  name: string;
  priceCny: string;
  priceRub: string;
}

interface ProductCardRecord {
  id: string;
  clientId: string;
  name: string;
  sku: string | null;
  description: string | null;
  dimensions: string | null;
  weightPerUnitKg: string | null;
  packaging: string | null;
  barcodeWb: string | null;
  barcodeOzon: string | null;
  barcodeYm: string | null;
  barcodeAmazon: string | null;
  photoId: string | null;
  services: ProductCardServiceRecord[];
}

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

// Одна строка "услуга" — переиспользуется и для услуг на позиции товара, и
// для услуг на партию целиком. serviceItemId != null — привязана к
// глобальному каталогу (имя/цена автоподставляются оттуда, но остаются
// редактируемыми — снэпшот, не живая ссылка); null — своя, свободная.
interface ServiceLine {
  key: string;
  serviceItemId: string | null;
  name: string;
  priceCny: string;
  quantity: string;
}

function blankServiceLine(): ServiceLine {
  return { key: crypto.randomUUID(), serviceItemId: null, name: "", priceCny: "", quantity: "1" };
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

function money(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

function serviceLineTotalRub(line: ServiceLine, cnyRateRub: number): number {
  return (Number(line.priceCny) || 0) * cnyRateRub * (Number(line.quantity) || 0);
}

// Строка "услуга": каталожный пикер (auto-подставляет имя/цену) + своё имя/
// цена, если ничего не выбрано или выбрано "Своя услуга". Используется и
// внутри позиции товара, и на уровне заказа целиком.
function ServiceLineEditor({
  lines,
  services,
  cnyRateRub,
  onChange,
}: {
  lines: ServiceLine[];
  services: ServiceItemRecord[];
  cnyRateRub: number;
  onChange: (lines: ServiceLine[]) => void;
}) {
  function update(key: string, patch: Partial<ServiceLine>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function remove(key: string) {
    onChange(lines.filter((l) => l.key !== key));
  }
  function add() {
    onChange([...lines, blankServiceLine()]);
  }
  function pickCatalog(key: string, serviceItemId: string) {
    if (!serviceItemId) {
      update(key, { serviceItemId: null });
      return;
    }
    const catalogItem = services.find((s) => s.id === serviceItemId);
    if (!catalogItem) return;
    update(key, { serviceItemId, name: catalogItem.name, priceCny: catalogItem.priceCny });
  }

  return (
    <div className="space-y-1.5">
      {lines.map((line) => (
        <div key={line.key} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5">
          <Select value={line.serviceItemId ?? "__custom__"} onValueChange={(v) => pickCatalog(line.key, v === "__custom__" ? "" : v)}>
            <SelectTrigger className="h-8 w-40 shrink-0 text-xs">
              <SelectValue placeholder="Услуга из каталога" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__custom__">Своя услуга</SelectItem>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Название"
            value={line.name}
            onChange={(e) => update(line.key, { name: e.target.value })}
            className="h-8 min-w-0 flex-1 text-xs"
          />
          <Input
            type="number"
            step="0.01"
            placeholder="¥"
            value={line.priceCny}
            onChange={(e) => update(line.key, { priceCny: e.target.value })}
            className="h-8 w-20 shrink-0 text-xs"
          />
          <Input
            type="number"
            min={1}
            step="1"
            placeholder="Кол-во"
            value={line.quantity}
            onChange={(e) => update(line.key, { quantity: e.target.value })}
            className="h-8 w-16 shrink-0 text-xs"
          />
          <span className="shrink-0 text-xs text-text-secondary">{money(serviceLineTotalRub(line, cnyRateRub))} ₽</span>
          <button
            type="button"
            onClick={() => remove(line.key)}
            className="shrink-0 rounded-md p-1 text-text-secondary transition-colors hover:bg-error/10 hover:text-error"
            aria-label="Удалить услугу"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-3.5 w-3.5" /> Добавить услугу
      </Button>
    </div>
  );
}

function ManagerFulfillmentTab() {
  // --- Клиенты фулфилмента (левая панель) ---
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientCode, setNewClientCode] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);
  const [clientFormError, setClientFormError] = useState<string | null>(null);

  const [teamManagers, setTeamManagers] = useState<{ id: string; name: string }[] | null>(null);
  const [reassigningClientId, setReassigningClientId] = useState<string | null>(null);
  const [codeDraft, setCodeDraft] = useState<string | null>(null);
  const [savingCode, setSavingCode] = useState(false);

  const [cnyRateRub, setCnyRateRub] = useState<number>(0);

  const loadClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const res = await fetch("/api/manager-clients?kind=fulfillment");
      const data = await res.json();
      if (res.ok) setClients(data.clients);
    } finally {
      setLoadingClients(false);
    }
  }, []);

  useEffect(() => {
    loadClients();
    fetch("/api/manager-team-managers")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setTeamManagers(data?.teamManagers ?? null));
    fetch("/api/manager-tariffs")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setCnyRateRub(Number(data?.settings?.cnyRateRub) || 0));
  }, [loadClients]);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q) || c.fulfillmentCode?.toLowerCase().includes(q),
    );
  }, [clients, clientSearch]);

  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  async function handleCreateClient() {
    if (!newClientName.trim()) return;
    if (newClientCode.trim() && !CODE_RE.test(newClientCode.trim())) {
      setClientFormError("Код клиента: 4 цифры + 2 латинские буквы, например 1234AB.");
      return;
    }
    setCreatingClient(true);
    setClientFormError(null);
    try {
      const res = await fetch("/api/manager-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newClientName.trim(),
          phone: newClientPhone.trim() || undefined,
          kind: "fulfillment",
          fulfillmentCode: newClientCode.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setClientFormError(data.error ?? "Не удалось создать клиента.");
        return;
      }
      setNewClientName("");
      setNewClientPhone("");
      setNewClientCode("");
      setShowNewClientForm(false);
      await loadClients();
      setSelectedClientId(data.client.id);
    } finally {
      setCreatingClient(false);
    }
  }

  async function handleSaveCode(clientId: string) {
    if (codeDraft === null) return;
    if (codeDraft.trim() && !CODE_RE.test(codeDraft.trim())) return;
    setSavingCode(true);
    try {
      const res = await fetch(`/api/manager-clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fulfillmentCode: codeDraft.trim() || null }),
      });
      if (res.ok) await loadClients();
    } finally {
      setSavingCode(false);
      setCodeDraft(null);
    }
  }

  async function handleReassign(clientId: string, managerId: string) {
    if (!managerId) return;
    setReassigningClientId(clientId);
    try {
      const res = await fetch(`/api/manager-fulfillment-clients/${clientId}/reassign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerId }),
      });
      if (res.ok) {
        await loadClients();
        await loadOrders();
      }
    } finally {
      setReassigningClientId(null);
    }
  }

  // --- Карточки товара выбранного клиента ---
  const [productCards, setProductCards] = useState<ProductCardRecord[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [cardName, setCardName] = useState("");
  const [cardSku, setCardSku] = useState("");
  const [cardDescription, setCardDescription] = useState("");
  const [cardDimensions, setCardDimensions] = useState("");
  const [cardWeight, setCardWeight] = useState("");
  const [cardPackaging, setCardPackaging] = useState("");
  const [cardBarcodeWb, setCardBarcodeWb] = useState("");
  const [cardBarcodeOzon, setCardBarcodeOzon] = useState("");
  const [cardBarcodeYm, setCardBarcodeYm] = useState("");
  const [cardBarcodeAmazon, setCardBarcodeAmazon] = useState("");
  const [cardPhotoFile, setCardPhotoFile] = useState<File | null>(null);
  const [cardServiceDrafts, setCardServiceDrafts] = useState<ServiceLine[]>([]);
  const [savingCard, setSavingCard] = useState(false);
  const [cardFormError, setCardFormError] = useState<string | null>(null);

  const loadProductCards = useCallback(async (clientId: string) => {
    setLoadingCards(true);
    try {
      const res = await fetch(`/api/manager-fulfillment-product-cards?clientId=${clientId}`);
      const data = await res.json();
      if (res.ok) setProductCards(data.cards);
    } finally {
      setLoadingCards(false);
    }
  }, []);

  useEffect(() => {
    if (selectedClientId) loadProductCards(selectedClientId);
    else setProductCards([]);
  }, [selectedClientId, loadProductCards]);

  function resetCardForm() {
    setEditingCardId(null);
    setCardName("");
    setCardSku("");
    setCardDescription("");
    setCardDimensions("");
    setCardWeight("");
    setCardPackaging("");
    setCardBarcodeWb("");
    setCardBarcodeOzon("");
    setCardBarcodeYm("");
    setCardBarcodeAmazon("");
    setCardPhotoFile(null);
    setCardServiceDrafts([]);
    setCardFormError(null);
    setShowCardForm(false);
  }

  function handleEditCard(card: ProductCardRecord) {
    setEditingCardId(card.id);
    setCardName(card.name);
    setCardSku(card.sku ?? "");
    setCardDescription(card.description ?? "");
    setCardDimensions(card.dimensions ?? "");
    setCardWeight(card.weightPerUnitKg ?? "");
    setCardPackaging(card.packaging ?? "");
    setCardBarcodeWb(card.barcodeWb ?? "");
    setCardBarcodeOzon(card.barcodeOzon ?? "");
    setCardBarcodeYm(card.barcodeYm ?? "");
    setCardBarcodeAmazon(card.barcodeAmazon ?? "");
    setCardPhotoFile(null);
    setCardServiceDrafts(
      card.services.map((s) => ({ key: crypto.randomUUID(), serviceItemId: s.serviceItemId, name: s.name, priceCny: s.priceCny, quantity: "1" })),
    );
    setCardFormError(null);
    setShowCardForm(true);
  }

  async function handleSaveCard() {
    if (!selectedClientId || !cardName.trim()) {
      setCardFormError("Укажите название товара.");
      return;
    }
    setSavingCard(true);
    setCardFormError(null);
    try {
      const formData = new FormData();
      formData.set("clientId", selectedClientId);
      formData.set("name", cardName.trim());
      if (cardSku.trim()) formData.set("sku", cardSku.trim());
      if (cardDescription.trim()) formData.set("description", cardDescription.trim());
      if (cardDimensions.trim()) formData.set("dimensions", cardDimensions.trim());
      if (cardWeight.trim()) formData.set("weightPerUnitKg", cardWeight.trim());
      if (cardPackaging.trim()) formData.set("packaging", cardPackaging.trim());
      if (cardBarcodeWb.trim()) formData.set("barcodeWb", cardBarcodeWb.trim());
      if (cardBarcodeOzon.trim()) formData.set("barcodeOzon", cardBarcodeOzon.trim());
      if (cardBarcodeYm.trim()) formData.set("barcodeYm", cardBarcodeYm.trim());
      if (cardBarcodeAmazon.trim()) formData.set("barcodeAmazon", cardBarcodeAmazon.trim());
      if (cardPhotoFile) formData.set("photo", cardPhotoFile);

      const res = await fetch(
        editingCardId ? `/api/manager-fulfillment-product-cards/${editingCardId}` : "/api/manager-fulfillment-product-cards",
        { method: editingCardId ? "PATCH" : "POST", body: formData },
      );
      const data = await res.json();
      if (!res.ok) {
        setCardFormError(data.error ?? "Не удалось сохранить карточку.");
        return;
      }
      const cardId: string = data.card.id;

      // Услуги карточки — полная замена: удаляем те, что были и пропали из
      // черновика, создаём/обновляем остальные. Простая, не самая быстрая
      // стратегия, но карточек услуг обычно немного (единицы).
      const existingCard = editingCardId ? productCards.find((c) => c.id === editingCardId) : null;
      const existingServiceIds = new Set(existingCard?.services.map((s) => s.id) ?? []);
      const keptIds = new Set<string>();
      for (const line of cardServiceDrafts) {
        if (!line.name.trim() || !Number.isFinite(Number(line.priceCny))) continue;
        const existingMatch = existingCard?.services.find(
          (s) => s.serviceItemId === line.serviceItemId && s.name === line.name && s.priceCny === line.priceCny,
        );
        if (existingMatch) {
          keptIds.add(existingMatch.id);
          continue;
        }
        await fetch(`/api/manager-fulfillment-product-cards/${cardId}/services`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serviceItemId: line.serviceItemId, name: line.name.trim(), priceCny: Number(line.priceCny) }),
        });
      }
      for (const id of existingServiceIds) {
        if (!keptIds.has(id)) {
          await fetch(`/api/manager-fulfillment-product-cards/${cardId}/services/${id}`, { method: "DELETE" });
        }
      }

      resetCardForm();
      await loadProductCards(selectedClientId);
    } finally {
      setSavingCard(false);
    }
  }

  async function handleDeleteCard(id: string) {
    if (!selectedClientId) return;
    if (!window.confirm("Удалить эту карточку товара безвозвратно?")) return;
    const res = await fetch(`/api/manager-fulfillment-product-cards/${id}`, { method: "DELETE" });
    if (res.ok) await loadProductCards(selectedClientId);
  }

  // --- Каталог услуг (общий, не привязан к клиенту) ---
  const [services, setServices] = useState<ServiceItemRecord[]>([]);

  const loadServices = useCallback(async () => {
    const res = await fetch("/api/manager-fulfillment-services");
    const data = await res.json();
    if (res.ok) setServices(data.items);
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  // --- Заказы ---
  const [orders, setOrders] = useState<FulfillmentOrderRecord[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [expandedPrintLogId, setExpandedPrintLogId] = useState<string | null>(null);
  const [busyServiceCompletionId, setBusyServiceCompletionId] = useState<string | null>(null);
  const [busyOrderActionId, setBusyOrderActionId] = useState<string | null>(null);
  const [busyReceiveItemId, setBusyReceiveItemId] = useState<string | null>(null);
  const [receiveDrafts, setReceiveDrafts] = useState<Record<string, string>>({});

  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [quoteId, setQuoteId] = useState("");
  const [clientQuotes, setClientQuotes] = useState<QuoteOption[]>([]);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([blankDraftItem()]);
  const [draftOrderServices, setDraftOrderServices] = useState<ServiceLine[]>([]);
  const [receivedAt, setReceivedAt] = useState("");
  const [plannedShipAt, setPlannedShipAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [showArchived, setShowArchived] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState<PeriodFilter>("all");

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

  useEffect(() => {
    if (!selectedClientId) {
      setClientQuotes([]);
      setQuoteId("");
      return;
    }
    fetch(`/api/manager-quotes?clientId=${selectedClientId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setClientQuotes(data?.quotes ?? []));
  }, [selectedClientId]);

  function itemTotalRub(item: DraftItem): number {
    return item.services.reduce((sum, line) => sum + serviceLineTotalRub(line, cnyRateRub), 0);
  }

  const orderTotalRub = useMemo(
    () =>
      draftItems.reduce((sum, item) => sum + itemTotalRub(item), 0) +
      draftOrderServices.reduce((sum, line) => sum + serviceLineTotalRub(line, cnyRateRub), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftItems, draftOrderServices, cnyRateRub],
  );

  function updateDraftItem(key: string, patch: Partial<DraftItem>) {
    setDraftItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function pickProductCard(itemKey: string, cardId: string) {
    if (!cardId) {
      updateDraftItem(itemKey, { productCardId: null });
      return;
    }
    const card = productCards.find((c) => c.id === cardId);
    if (!card) return;
    updateDraftItem(itemKey, {
      productCardId: cardId,
      name: card.name,
      sku: card.sku ?? "",
      dimensions: card.dimensions ?? "",
      services: card.services.map((s) => ({
        key: crypto.randomUUID(),
        serviceItemId: s.serviceItemId,
        name: s.name,
        priceCny: s.priceCny,
        quantity: "1",
      })),
    });
  }

  function addDraftItem() {
    setDraftItems((current) => [...current, blankDraftItem()]);
  }

  function removeDraftItem(key: string) {
    setDraftItems((current) => (current.length > 1 ? current.filter((item) => item.key !== key) : current));
  }

  async function handleCreateOrEditOrder() {
    if (!selectedClientId) {
      setFormError("Выберите клиента слева.");
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
      const res = await fetch(
        editingOrderId ? `/api/manager-fulfillment-orders/${editingOrderId}` : "/api/manager-fulfillment-orders",
        {
          method: editingOrderId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: selectedClientId,
            quoteId: quoteId || null,
            items,
            orderServices,
            receivedAt: receivedAt || null,
            plannedShipAt: plannedShipAt || null,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Не удалось сохранить заказ.");
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
    setSelectedClientId(order.client.id);
    setEditingOrderId(order.id);
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
            services: item.services.map((s) => ({
              key: crypto.randomUUID(),
              serviceItemId: s.serviceItemId,
              name: s.name,
              priceCny: s.priceCny,
              quantity: String(s.quantity),
            })),
          }))
        : [blankDraftItem()],
    );
    setDraftOrderServices(
      order.orderServices.map((s) => ({ key: crypto.randomUUID(), serviceItemId: null, name: s.name, priceCny: s.priceCny, quantity: String(s.quantity) })),
    );
    setExpandedOrderId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancelEdit() {
    setEditingOrderId(null);
    setDraftItems([blankDraftItem()]);
    setDraftOrderServices([]);
    setQuoteId("");
    setReceivedAt("");
    setPlannedShipAt("");
    setFormError(null);
  }

  async function handleDeleteOrder(id: string) {
    if (!window.confirm("Удалить этот заказ безвозвратно?")) return;
    setBusyOrderActionId(id);
    try {
      const res = await fetch(`/api/manager-fulfillment-orders/${id}`, { method: "DELETE" });
      if (res.ok) await loadOrders();
    } finally {
      setBusyOrderActionId(null);
    }
  }

  async function handleToggleArchiveOrder(order: FulfillmentOrderRecord) {
    if (!order.archivedAt && !window.confirm("Отправить этот заказ в архив?")) return;
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

  // Заказы выбранного клиента, по периоду создания — client-side над уже
  // загруженным (и уже role-scoped/archived-filtered) списком, тот же
  // подход, что и в clients-tab.tsx.
  const clientOrders = useMemo(() => {
    if (!selectedClientId) return [];
    const since = periodStart(filterPeriod);
    return orders.filter((order) => {
      if (order.client.id !== selectedClientId) return false;
      if (since && new Date(order.createdAt) < since) return false;
      return true;
    });
  }, [orders, selectedClientId, filterPeriod]);

  // --- Service price-list management (collapsed by default) ---
  const [showServicePanel, setShowServicePanel] = useState(false);
  const [serviceDrafts, setServiceDrafts] = useState<Record<string, { name: string; priceCny: string }>>({});
  const [busyServiceId, setBusyServiceId] = useState<string | null>(null);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [servicePanelError, setServicePanelError] = useState<string | null>(null);

  async function handleSaveService(id: string, original: ServiceItemRecord) {
    const draft = serviceDrafts[id];
    if (!draft || (draft.name === original.name && draft.priceCny === original.priceCny)) return;
    setBusyServiceId(id);
    setServicePanelError(null);
    try {
      const res = await fetch(`/api/manager-fulfillment-services/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, priceCny: Number(draft.priceCny) }),
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
      body: JSON.stringify({ name: newServiceName.trim(), priceCny: Number(newServicePrice) }),
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
          Клиенты фулфилмента, их карточки товаров и заказы на складскую обработку.
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:h-[calc(100vh-260px)] lg:min-h-140 lg:flex-row">
        {/* ЛЕВАЯ ПАНЕЛЬ — клиенты фулфилмента */}
        <div
          className={cn(
            "flex w-full shrink-0 flex-col rounded-xl border border-border bg-surface lg:w-72",
            selectedClientId ? "hidden lg:flex" : "flex",
          )}
        >
          <div className="space-y-2 border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
              <Input
                placeholder="Поиск клиента / код"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
            {showNewClientForm ? (
              <div className="space-y-1.5 rounded-lg border border-border bg-bg p-2">
                <Input placeholder="Имя клиента" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} className="h-8 text-sm" />
                <Input placeholder="Телефон (необязательно)" value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)} className="h-8 text-sm" />
                <Input placeholder="Код (1234AB)" value={newClientCode} onChange={(e) => setNewClientCode(e.target.value)} className="h-8 text-sm" />
                {clientFormError && <p className="text-xs text-error">{clientFormError}</p>}
                <div className="flex gap-1.5">
                  <Button type="button" size="sm" onClick={handleCreateClient} disabled={creatingClient}>
                    {creatingClient ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Создать"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewClientForm(false)}>
                    Отмена
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setShowNewClientForm(true)}>
                <Plus className="h-3.5 w-3.5" /> Новый клиент
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingClients ? (
              <p className="p-3 text-xs text-text-secondary">Загрузка…</p>
            ) : filteredClients.length === 0 ? (
              <p className="p-3 text-xs text-text-secondary">Клиентов фулфилмента пока нет.</p>
            ) : (
              <ul>
                {filteredClients.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedClientId(c.id)}
                      className={cn(
                        "flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2 text-left transition-colors hover:bg-bg",
                        selectedClientId === c.id && "bg-primary/5",
                      )}
                    >
                      <span className="truncate text-sm font-medium text-text">
                        {c.name}
                        {c.company ? ` (${c.company})` : ""}
                      </span>
                      {c.fulfillmentCode && <span className="text-[11px] text-text-secondary">Код: {c.fulfillmentCode}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ПРАВАЯ ПАНЕЛЬ — карточка выбранного клиента */}
        <div className={cn("min-w-0 flex-1 space-y-4 overflow-y-auto", !selectedClientId && "hidden lg:block")}>
          {!selectedClient ? (
            <EmptyState icon={Package} message="Выберите клиента слева или создайте нового." />
          ) : (
            <>
              <button type="button" onClick={() => setSelectedClientId(null)} className="text-xs text-primary hover:underline lg:hidden">
                ← Все клиенты
              </button>

              <Card className="p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-text">
                      {selectedClient.name}
                      {selectedClient.company ? ` (${selectedClient.company})` : ""}
                    </p>
                    <p className="text-xs text-text-secondary">Менеджер: {selectedClient.createdByManager?.name ?? "—"}</p>
                  </div>
                  {teamManagers && teamManagers.length > 1 && (
                    <Select
                      value=""
                      onValueChange={(v) => handleReassign(selectedClient.id, v)}
                      disabled={reassigningClientId === selectedClient.id}
                    >
                      <SelectTrigger className="h-8 w-48 text-xs">
                        <SelectValue placeholder="Передать менеджеру" />
                      </SelectTrigger>
                      <SelectContent>
                        {teamManagers
                          .filter((m) => m.id !== selectedClient.createdByManagerId)
                          .map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-text-secondary">Код склада:</Label>
                  <Input
                    value={codeDraft ?? selectedClient.fulfillmentCode ?? ""}
                    onChange={(e) => setCodeDraft(e.target.value)}
                    onBlur={() => handleSaveCode(selectedClient.id)}
                    disabled={savingCode}
                    placeholder="1234AB"
                    className="h-7 w-28 text-xs"
                  />
                </div>
              </Card>

              {/* Карточки товара */}
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-text">Карточки товара</p>
                  {!showCardForm && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowCardForm(true)}>
                      <Plus className="h-3.5 w-3.5" /> Новая карточка
                    </Button>
                  )}
                </div>

                {showCardForm && (
                  <div className="space-y-2 rounded-lg border border-border bg-bg p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input placeholder="Название товара" value={cardName} onChange={(e) => setCardName(e.target.value)} />
                      <Input placeholder="Артикул" value={cardSku} onChange={(e) => setCardSku(e.target.value)} />
                      <Input placeholder="Габариты" value={cardDimensions} onChange={(e) => setCardDimensions(e.target.value)} />
                      <Input type="number" step="0.01" placeholder="Вес за единицу, кг" value={cardWeight} onChange={(e) => setCardWeight(e.target.value)} />
                      <Input placeholder="Фасовка" value={cardPackaging} onChange={(e) => setCardPackaging(e.target.value)} />
                      <Input type="file" accept="image/*" onChange={(e) => setCardPhotoFile(e.target.files?.[0] ?? null)} className="text-xs" />
                    </div>
                    <Input placeholder="Описание" value={cardDescription} onChange={(e) => setCardDescription(e.target.value)} />
                    <div>
                      <Label className="text-xs text-text-secondary">Штрихкоды маркетплейсов</Label>
                      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                        <Input placeholder="Штрихкод WB" value={cardBarcodeWb} onChange={(e) => setCardBarcodeWb(e.target.value)} />
                        <Input placeholder="Штрихкод OZON" value={cardBarcodeOzon} onChange={(e) => setCardBarcodeOzon(e.target.value)} />
                        <Input placeholder="Штрихкод YM" value={cardBarcodeYm} onChange={(e) => setCardBarcodeYm(e.target.value)} />
                        <Input placeholder="Штрихкод AMAZON" value={cardBarcodeAmazon} onChange={(e) => setCardBarcodeAmazon(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-text-secondary">Услуги по умолчанию для этого товара</Label>
                      <div className="mt-1.5">
                        <ServiceLineEditor lines={cardServiceDrafts} services={services} cnyRateRub={cnyRateRub} onChange={setCardServiceDrafts} />
                      </div>
                    </div>
                    {cardFormError && <p className="text-xs text-error">{cardFormError}</p>}
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={handleSaveCard} disabled={savingCard}>
                        {savingCard ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : editingCardId ? "Сохранить" : "Создать карточку"}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={resetCardForm}>
                        Отмена
                      </Button>
                    </div>
                  </div>
                )}

                {loadingCards ? (
                  <p className="text-xs text-text-secondary">Загрузка…</p>
                ) : productCards.length === 0 ? (
                  <p className="text-xs text-text-secondary">У этого клиента пока нет карточек товара.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {productCards.map((card) => (
                      <div key={card.id} className="flex gap-2 rounded-lg border border-border bg-bg p-2.5">
                        {card.photoId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/manager-fulfillment-product-cards/photos/${card.photoId}`}
                            alt={card.name}
                            className="h-14 w-14 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-surface text-text-secondary">
                            <ImageIcon className="h-5 w-5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text">{card.name}</p>
                          <p className="truncate text-[11px] text-text-secondary">
                            {[card.sku, card.dimensions, card.packaging].filter(Boolean).join(" · ") || "—"}
                          </p>
                          <p className="text-[11px] text-text-secondary">{card.services.length} услуг(и) по умолчанию</p>
                          {(card.barcodeWb || card.barcodeOzon || card.barcodeYm || card.barcodeAmazon) && (
                            <p className="truncate text-[11px] text-text-secondary">
                              {[
                                card.barcodeWb && `WB: ${card.barcodeWb}`,
                                card.barcodeOzon && `OZON: ${card.barcodeOzon}`,
                                card.barcodeYm && `YM: ${card.barcodeYm}`,
                                card.barcodeAmazon && `AMAZON: ${card.barcodeAmazon}`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col gap-1">
                          <button type="button" onClick={() => handleEditCard(card)} className="text-text-secondary hover:text-primary" aria-label="Редактировать">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => handleDeleteCard(card.id)} className="text-text-secondary hover:text-error" aria-label="Удалить">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Форма заказа */}
              <Card className="p-4 space-y-4">
                {editingOrderId && (
                  <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
                    <span>Редактирование заказа</span>
                    <button type="button" onClick={handleCancelEdit} className="flex items-center gap-1 hover:underline">
                      <X className="h-3.5 w-3.5" /> Отменить
                    </button>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
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
                  <div className="space-y-1.5">
                    <Label>Принято на складе</Label>
                    <Input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Плановая отгрузка</Label>
                    <Input type="date" value={plannedShipAt} onChange={(e) => setPlannedShipAt(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-3">
                  {draftItems.map((item, index) => (
                    <div key={item.key} className="rounded-lg border border-border bg-bg p-3 space-y-2.5">
                      <div className="flex items-start gap-2">
                        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                          {productCards.length > 0 && (
                            <Select value={item.productCardId ?? ""} onValueChange={(v) => pickProductCard(item.key, v)}>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Выбрать карточку товара" />
                              </SelectTrigger>
                              <SelectContent>
                                {productCards.map((card) => (
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

                      <ServiceLineEditor
                        lines={item.services}
                        services={services}
                        cnyRateRub={cnyRateRub}
                        onChange={(lines) => updateDraftItem(item.key, { services: lines })}
                      />
                      <p className="text-right text-xs text-text-secondary">Товар: {money(itemTotalRub(item))} ₽</p>
                    </div>
                  ))}
                </div>

                <Button type="button" variant="outline" size="sm" onClick={addDraftItem}>
                  <Plus className="h-4 w-4" /> Добавить товар
                </Button>

                <div className="space-y-1.5 border-t border-border pt-3">
                  <Label className="text-xs text-text-secondary">Услуги на партию целиком (не привязаны к товару)</Label>
                  <ServiceLineEditor lines={draftOrderServices} services={services} cnyRateRub={cnyRateRub} onChange={setDraftOrderServices} />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                  <p className="text-sm font-bold text-text">Итого: {money(orderTotalRub)} ₽</p>
                  <Button type="button" onClick={handleCreateOrEditOrder} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingOrderId ? "Сохранить изменения" : "Сохранить заказ"}
                  </Button>
                </div>
                {formError && <p className="text-xs text-error">{formError}</p>}
              </Card>

              {/* Список заказов клиента */}
              <div className="flex flex-wrap items-center gap-2">
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
              ) : clientOrders.length === 0 ? (
                <EmptyState icon={Package} message="Заказов у этого клиента пока нет." />
              ) : (
                <div className="space-y-2">
                  {clientOrders.map((order) => {
                    const isOpen = expandedOrderId === order.id;
                    const totalServices = order.items.reduce((sum, item) => sum + item.services.length, 0);
                    const completedServices = order.items.reduce((sum, item) => sum + item.services.filter((s) => s.completedAt).length, 0);
                    return (
                      <div key={order.id} className={cn("rounded-xl border border-border bg-surface", order.archivedAt && "opacity-60")}>
                        <button
                          type="button"
                          onClick={() => setExpandedOrderId(isOpen ? null : order.id)}
                          className="flex w-full flex-wrap items-center gap-3 p-3 text-left"
                        >
                          <span className="text-xs text-text-secondary">{new Date(order.createdAt).toLocaleDateString("ru-RU")}</span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                            №{order.displayId}
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
                          <span className="shrink-0 text-sm font-bold text-text">{money(Number(order.totalRub))} ₽</span>
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
                                {(order.receivedAt || order.plannedShipAt) && (
                                  <span className="text-[11px] text-text-secondary">
                                    {order.receivedAt && `Принят: ${new Date(order.receivedAt).toLocaleDateString("ru-RU")}`}
                                    {order.receivedAt && order.plannedShipAt && " · "}
                                    {order.plannedShipAt && `Отгрузка: ${new Date(order.plannedShipAt).toLocaleDateString("ru-RU")}`}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <a
                                  href={`/api/manager-fulfillment-orders/${order.id}/pdf`}
                                  onClick={() => setTimeout(() => loadOrders(), 800)}
                                  className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
                                >
                                  <Download className="h-3.5 w-3.5" /> Наряд для склада
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

                            {order.printLogs.length > 0 && (
                              <div>
                                <button
                                  type="button"
                                  onClick={() => setExpandedPrintLogId(expandedPrintLogId === order.id ? null : order.id)}
                                  className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-text"
                                >
                                  <Printer className="h-3 w-3" /> Печатался {order.printLogs.length} раз(а)
                                  <ChevronDown className={cn("h-3 w-3 transition-transform", expandedPrintLogId === order.id && "rotate-180")} />
                                </button>
                                {expandedPrintLogId === order.id && (
                                  <ul className="mt-1 space-y-0.5 pl-4 text-[11px] text-text-secondary">
                                    {order.printLogs.map((log) => (
                                      <li key={log.id}>
                                        {log.printedByManager.name} — {new Date(log.printedAt).toLocaleString("ru-RU")}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}

                            {order.items.map((item) => (
                              <div key={item.id} className="rounded-lg border border-border bg-bg p-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-sm font-medium text-text">{item.name}</div>
                                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                                    <span>План: {item.plannedQuantity}</span>
                                    <span>· Факт:</span>
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
                                </div>
                                {(item.sku || item.dimensions) && (
                                  <div className="text-xs text-text-secondary">
                                    {item.sku ? `Артикул: ${item.sku}` : ""}
                                    {item.sku && item.dimensions ? " · " : ""}
                                    {item.dimensions ? `Габариты: ${item.dimensions}` : ""}
                                  </div>
                                )}
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
                                      <span className="shrink-0 text-xs text-text-secondary">{money(Number(service.priceRub) * service.quantity)} ₽</span>
                                      {service.completedAt && <span className="shrink-0 text-[11px] text-text-secondary">{service.completedByManager?.name}</span>}
                                    </label>
                                  ))}
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
                                      <span className="shrink-0 text-xs text-text-secondary">{money(Number(s.priceRub) * s.quantity)} ₽</span>
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
            </>
          )}
        </div>
      </div>

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
                  onChange={(e) => setServiceDrafts((c) => ({ ...c, [s.id]: { name: e.target.value, priceCny: c[s.id]?.priceCny ?? s.priceCny } }))}
                  onBlur={() => handleSaveService(s.id, s)}
                  disabled={busyServiceId === s.id}
                  className="h-8 min-w-0 flex-1 text-sm"
                />
                <Input
                  type="number"
                  step="0.01"
                  value={serviceDrafts[s.id]?.priceCny ?? s.priceCny}
                  onChange={(e) => setServiceDrafts((c) => ({ ...c, [s.id]: { name: c[s.id]?.name ?? s.name, priceCny: e.target.value } }))}
                  onBlur={() => handleSaveService(s.id, s)}
                  disabled={busyServiceId === s.id}
                  className="h-8 w-24 shrink-0 text-sm"
                />
                <span className="shrink-0 text-xs text-text-secondary">≈{money(Number(s.priceRub))} ₽</span>
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
              <Input type="number" step="0.01" placeholder="¥" value={newServicePrice} onChange={(e) => setNewServicePrice(e.target.value)} className="h-8 w-24 shrink-0 text-sm" />
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
