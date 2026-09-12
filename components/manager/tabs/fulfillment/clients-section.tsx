"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, ImageIcon, Loader2, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/desk/empty-state";
import { cn } from "@/lib/utils";
import {
  CODE_RE,
  ServiceItemRecord,
  ClientOption,
  ProductCardRecord,
  MarketplaceFlow,
  MARKETPLACE_FLOW_LABEL,
  MARKETPLACE_FLOW_BADGE_CLASSES,
  ServiceLine,
  moneyCny,
  serviceLineTotalRub,
  serviceLineTotalCny,
  ServiceLineEditor,
} from "./shared";

// «Клиенты» — клиенты фулфилмента, их карточки товара и быстрое создание
// заявки на обработку галочками. Список УЖЕ созданных заявок живёт в
// отдельной под-вкладке «Заявки на обработку» (см. orders-list.tsx) — тут
// только создание. См. план «Фулфилмент: под-вкладки», PB-V5 chat
// 2026-09-12.
function FulfillmentClientsSection() {
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
  const [showArchivedClients, setShowArchivedClients] = useState(false);

  // Редактирование карточки клиента (имя/компания/контакты) и архивирование
  // — тот же паттерн, что и в «Клиенты» (clients-tab.tsx): жёсткого
  // удаления клиента в системе нет вообще, только архив.
  const [editingClient, setEditingClient] = useState(false);
  const [editDraft, setEditDraft] = useState({ name: "", company: "", phone: "", messenger: "", email: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [archivingClientId, setArchivingClientId] = useState<string | null>(null);

  const [cnyRateRub, setCnyRateRub] = useState<number>(0);

  const loadClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const res = await fetch(`/api/manager-clients?kind=fulfillment${showArchivedClients ? "&includeArchived=1" : ""}`);
      const data = await res.json();
      if (res.ok) setClients(data.clients);
    } finally {
      setLoadingClients(false);
    }
  }, [showArchivedClients]);

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
    return clients.filter((c) => c.name.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q) || c.fulfillmentCode?.toLowerCase().includes(q));
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
      if (res.ok) await loadClients();
    } finally {
      setReassigningClientId(null);
    }
  }

  function startEditingClient(client: ClientOption) {
    setEditDraft({ name: client.name, company: client.company ?? "", phone: client.phone ?? "", messenger: client.messenger ?? "", email: client.email ?? "" });
    setEditError(null);
    setEditingClient(true);
  }

  async function handleSaveClientEdit(clientId: string) {
    if (!editDraft.name.trim()) {
      setEditError("Укажите имя клиента.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/manager-clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editDraft.name.trim(),
          company: editDraft.company.trim(),
          phone: editDraft.phone.trim(),
          messenger: editDraft.messenger.trim(),
          email: editDraft.email.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "Не удалось сохранить.");
        return;
      }
      setEditingClient(false);
      await loadClients();
    } finally {
      setEditSaving(false);
    }
  }

  async function handleToggleArchiveClient(client: ClientOption) {
    if (!client.archivedAt && !window.confirm(`Отправить клиента «${client.name}» в архив? Жёсткого удаления нет — историю можно будет вернуть.`)) return;
    setArchivingClientId(client.id);
    try {
      const res = await fetch(`/api/manager-clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !client.archivedAt }),
      });
      if (res.ok) {
        await loadClients();
        if (client.archivedAt === null) setSelectedClientId(null);
      }
    } finally {
      setArchivingClientId(null);
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
  const [cardMarketplaceFlow, setCardMarketplaceFlow] = useState<MarketplaceFlow | null>(null);
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

  // Массовый выбор карточек товара — для быстрого создания заявки на
  // обработку сразу по нескольким товарам клиента (без ручного добавления
  // каждой позиции через форму).
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [creatingRequestFromCards, setCreatingRequestFromCards] = useState(false);
  const [requestFromCardsError, setRequestFromCardsError] = useState<string | null>(null);

  function toggleCardSelection(cardId: string) {
    setSelectedCardIds((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

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
    setSelectedCardIds(new Set());
    if (selectedClientId) loadProductCards(selectedClientId);
    else setProductCards([]);
  }, [selectedClientId, loadProductCards]);

  // --- Каталог услуг "к товару" (для дефолтных услуг карточки) ---
  const [itemServices, setItemServices] = useState<ServiceItemRecord[]>([]);
  useEffect(() => {
    fetch("/api/manager-fulfillment-services?scope=item")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setItemServices(data?.items ?? []));
  }, []);

  function resetCardForm() {
    setEditingCardId(null);
    setCardName("");
    setCardSku("");
    setCardDescription("");
    setCardDimensions("");
    setCardMarketplaceFlow(null);
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
    setCardMarketplaceFlow(card.marketplaceFlow);
    setCardWeight(card.weightPerUnitKg ?? "");
    setCardPackaging(card.packaging ?? "");
    setCardBarcodeWb(card.barcodeWb ?? "");
    setCardBarcodeOzon(card.barcodeOzon ?? "");
    setCardBarcodeYm(card.barcodeYm ?? "");
    setCardBarcodeAmazon(card.barcodeAmazon ?? "");
    setCardPhotoFile(null);
    setCardServiceDrafts(card.services.map((s) => ({ key: crypto.randomUUID(), serviceItemId: s.serviceItemId, name: s.name, priceCny: s.priceCny, quantity: "1" })));
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
      formData.set("marketplaceFlow", cardMarketplaceFlow ?? "");
      if (cardWeight.trim()) formData.set("weightPerUnitKg", cardWeight.trim());
      if (cardPackaging.trim()) formData.set("packaging", cardPackaging.trim());
      if (cardBarcodeWb.trim()) formData.set("barcodeWb", cardBarcodeWb.trim());
      if (cardBarcodeOzon.trim()) formData.set("barcodeOzon", cardBarcodeOzon.trim());
      if (cardBarcodeYm.trim()) formData.set("barcodeYm", cardBarcodeYm.trim());
      if (cardBarcodeAmazon.trim()) formData.set("barcodeAmazon", cardBarcodeAmazon.trim());
      if (cardPhotoFile) formData.set("photo", cardPhotoFile);

      const res = await fetch(editingCardId ? `/api/manager-fulfillment-product-cards/${editingCardId}` : "/api/manager-fulfillment-product-cards", {
        method: editingCardId ? "PATCH" : "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setCardFormError(data.error ?? "Не удалось сохранить карточку.");
        return;
      }
      const cardId: string = data.card.id;

      // Услуги карточки — полная замена: удаляем те, что были и пропали из
      // черновика, создаём/обновляем остальные.
      const existingCard = editingCardId ? productCards.find((c) => c.id === editingCardId) : null;
      const existingServiceIds = new Set(existingCard?.services.map((s) => s.id) ?? []);
      const keptIds = new Set<string>();
      for (const line of cardServiceDrafts) {
        if (!line.name.trim() || !Number.isFinite(Number(line.priceCny))) continue;
        const existingMatch = existingCard?.services.find((s) => s.serviceItemId === line.serviceItemId && s.name === line.name && s.priceCny === line.priceCny);
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

  // Быстрый путь: галочки на карточках товара → одна кнопка → заявка на
  // обработку сразу по всем отмеченным товарам, с их сохранёнными
  // услугами по умолчанию (кол-во услуг = 1, план по товару = 1 — оба
  // редактируются после создания в самой заявке, на вкладке «Заявки на
  // обработку»).
  async function handleCreateOrderFromSelectedCards() {
    if (!selectedClientId || selectedCardIds.size === 0) return;
    setCreatingRequestFromCards(true);
    setRequestFromCardsError(null);
    try {
      const items = productCards
        .filter((card) => selectedCardIds.has(card.id))
        .map((card) => ({
          name: card.name,
          sku: card.sku ?? undefined,
          dimensions: card.dimensions ?? undefined,
          plannedQuantity: 1,
          productCardId: card.id,
          services: card.services.map((s) => ({ serviceItemId: s.serviceItemId, name: s.name, priceCny: Number(s.priceCny), quantity: 1 })),
        }));
      const emptyItem = items.find((item) => item.services.length === 0);
      if (emptyItem) {
        setRequestFromCardsError(`У товара «${emptyItem.name}» нет услуг по умолчанию — добавьте их в карточку или создайте заявку вручную во вкладке «Заявки на обработку».`);
        return;
      }
      const res = await fetch("/api/manager-fulfillment-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: selectedClientId, items, orderServices: [] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRequestFromCardsError(data.error ?? "Не удалось создать заявку.");
        return;
      }
      setSelectedCardIds(new Set());
    } finally {
      setCreatingRequestFromCards(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-320px)] lg:min-h-140 lg:flex-row">
      {/* ЛЕВАЯ ПАНЕЛЬ — клиенты фулфилмента */}
      <div className={cn("flex w-full shrink-0 flex-col rounded-xl border border-border bg-surface lg:w-72", selectedClientId ? "hidden lg:flex" : "flex")}>
        <div className="space-y-2 border-b border-border p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
            <Input placeholder="Поиск клиента / код" value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} className="h-8 pl-8 text-sm" />
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
          <label className="flex items-center gap-1.5 text-xs text-text-secondary">
            <input type="checkbox" checked={showArchivedClients} onChange={(e) => setShowArchivedClients(e.target.checked)} />
            Показывать архивных
          </label>
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
                      c.archivedAt && "opacity-60",
                    )}
                  >
                    <span className="truncate text-sm font-medium text-text">
                      {c.name}
                      {c.company ? ` (${c.company})` : ""}
                      {c.archivedAt && <span className="ml-1.5 text-[10px] font-normal text-error">архив</span>}
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
                  <Select value="" onValueChange={(v) => handleReassign(selectedClient.id, v)} disabled={reassigningClientId === selectedClient.id}>
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
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" size="sm" variant="outline" onClick={() => startEditingClient(selectedClient)}>
                  <Pencil className="h-3.5 w-3.5" /> Редактировать
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => handleToggleArchiveClient(selectedClient)} disabled={archivingClientId === selectedClient.id}>
                  {archivingClientId === selectedClient.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : selectedClient.archivedAt ? (
                    <ArchiveRestore className="h-3.5 w-3.5" />
                  ) : (
                    <Archive className="h-3.5 w-3.5" />
                  )}
                  {selectedClient.archivedAt ? "Из архива" : "В архив"}
                </Button>
              </div>

              {editingClient && (
                <div className="space-y-2 rounded-lg bg-bg p-3">
                  <p className="text-xs font-semibold text-text-secondary">Редактирование клиента</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input placeholder="Имя клиента" value={editDraft.name} onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))} />
                    <Input placeholder="Компания" value={editDraft.company} onChange={(e) => setEditDraft((d) => ({ ...d, company: e.target.value }))} />
                    <Input placeholder="Телефон" value={editDraft.phone} onChange={(e) => setEditDraft((d) => ({ ...d, phone: e.target.value }))} />
                    <Input placeholder="Telegram / WeChat" value={editDraft.messenger} onChange={(e) => setEditDraft((d) => ({ ...d, messenger: e.target.value }))} />
                    <Input type="email" placeholder="Email" value={editDraft.email} onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))} />
                  </div>
                  {editError && <p className="text-xs text-error">{editError}</p>}
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => handleSaveClientEdit(selectedClient.id)} disabled={editSaving}>
                      {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditingClient(false)}>
                      Отмена
                    </Button>
                  </div>
                </div>
              )}
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
                    <div className="flex items-center gap-1.5">
                      <Label className="shrink-0 text-xs text-text-secondary">Маркетплейс:</Label>
                      <div className="flex gap-1 rounded-lg border border-border bg-surface p-0.5">
                        {(["fbs", "fbo", "both"] as const).map((flow) => (
                          <button
                            key={flow}
                            type="button"
                            onClick={() => setCardMarketplaceFlow(cardMarketplaceFlow === flow ? null : flow)}
                            className={cn(
                              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                              cardMarketplaceFlow === flow ? MARKETPLACE_FLOW_BADGE_CLASSES[flow] : "text-text-secondary hover:text-text",
                            )}
                          >
                            {MARKETPLACE_FLOW_LABEL[flow]}
                          </button>
                        ))}
                      </div>
                    </div>
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
                      <ServiceLineEditor lines={cardServiceDrafts} services={itemServices} cnyRateRub={cnyRateRub} onChange={setCardServiceDrafts} />
                    </div>
                    {cardServiceDrafts.length > 0 && (
                      <p className="mt-1 text-right text-xs font-medium text-text-secondary">
                        Итого: {moneyCny(cardServiceDrafts.reduce((sum, line) => sum + serviceLineTotalCny(line), 0), cardServiceDrafts.reduce((sum, line) => sum + serviceLineTotalRub(line, cnyRateRub), 0))}
                      </p>
                    )}
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
                <>
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-bg px-3 py-2">
                    <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                      <input
                        type="checkbox"
                        checked={selectedCardIds.size === productCards.length}
                        onChange={(e) => setSelectedCardIds(e.target.checked ? new Set(productCards.map((c) => c.id)) : new Set())}
                      />
                      Выбрать все ({selectedCardIds.size}/{productCards.length})
                    </label>
                    <Button type="button" size="sm" className="ml-auto" disabled={selectedCardIds.size === 0 || creatingRequestFromCards} onClick={handleCreateOrderFromSelectedCards}>
                      {creatingRequestFromCards ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Создать заявку на обработку
                    </Button>
                  </div>
                  {requestFromCardsError && <p className="text-xs text-error">{requestFromCardsError}</p>}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {productCards.map((card) => (
                      <div key={card.id} className={cn("flex gap-2 rounded-lg border bg-bg p-2.5", selectedCardIds.has(card.id) ? "border-primary" : "border-border")}>
                        <input type="checkbox" checked={selectedCardIds.has(card.id)} onChange={() => toggleCardSelection(card.id)} className="mt-1 shrink-0" aria-label={`Выбрать ${card.name}`} />
                        {card.photoId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/manager-fulfillment-product-cards/photos/${card.photoId}`} alt={card.name} className="h-14 w-14 shrink-0 rounded-md object-cover" />
                        ) : (
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-surface text-text-secondary">
                            <ImageIcon className="h-5 w-5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-sm font-medium text-text">{card.name}</p>
                            {card.marketplaceFlow && (
                              <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", MARKETPLACE_FLOW_BADGE_CLASSES[card.marketplaceFlow])}>
                                {MARKETPLACE_FLOW_LABEL[card.marketplaceFlow]}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-text-secondary">{[card.sku, card.dimensions, card.packaging].filter(Boolean).join(" · ") || "—"}</p>
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
                </>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

export { FulfillmentClientsSection };
