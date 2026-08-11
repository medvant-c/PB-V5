"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Download, Loader2, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type CashOrderType = "income" | "expense";
type CashCurrency = "cny" | "usd" | "rub";

type CashCategoryPayoutTarget = "investor" | "assigned_manager";

type QuotePaymentCategoryValue = "goods" | "china_delivery" | "search_service" | "custom_production" | "buyout_commission" | "attached_services";

interface CashCategoryRecord {
  id: string;
  type: CashOrderType;
  name: string;
  payoutTarget: CashCategoryPayoutTarget | null;
  linkedInvestorId: string | null;
  linkedInvestor: { id: string; name: string } | null;
  linkedProfitCategory: QuotePaymentCategoryValue | null;
}

const PROFIT_CATEGORY_LABEL: Record<QuotePaymentCategoryValue, string> = {
  goods: "Стоимость товара",
  china_delivery: "Доставка по Китаю",
  search_service: "Услуга поиска",
  custom_production: "Производство под заказ",
  buyout_commission: "Комиссия за выкуп",
  attached_services: "Доп. услуги",
};

interface InvestorOption {
  id: string;
  name: string;
}

// Счёт (см. CashAccount в prisma/schema.prisma) — "кто держит деньги"
// (Александр/Антон), отдельно от статьи ("на что"). balanceCny — прямо
// сейчас, независимо от выбранного в ленте месяца (см. /api/manager-cash-
// accounts, computeAccountBalanceCny).
interface CashAccountRecord {
  id: string;
  name: string;
  balanceCny: number;
}

// Перевод между счетами (см. CashTransfer) — не доход/расход, отдельная
// история. См. PB-V5 chat 2026-08-08.
interface CashTransferRecord {
  id: string;
  date: string;
  fromAccount: { id: string; name: string };
  toAccount: { id: string; name: string };
  currency: CashCurrency;
  amount: string;
  cnyToCurrencyRate: string;
  amountCny: string;
  comment: string;
  createdByManager: { name: string };
}

interface CashOrderRecord {
  id: string;
  type: CashOrderType;
  date: string;
  accountId: string;
  account: { id: string; name: string };
  categoryId: string;
  category: { id: string; name: string };
  clientId: string | null;
  client: { id: string; name: string } | null;
  quoteId: string | null;
  quote: { id: string; displayId: number; productName: string } | null;
  currency: CashCurrency;
  amount: string;
  cnyToCurrencyRate: string;
  amountCny: string;
  comment: string;
  createdByManager: { name: string };
}

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
}

interface ClientQuoteOption {
  id: string;
  displayId: number;
  productName: string;
  buyoutFactConfirmed: boolean;
}

interface Summary {
  openingBalanceCny: number;
  incomeCny: number;
  expenseCny: number;
  closingBalanceCny: number;
}

const CURRENCY_LABEL: Record<CashCurrency, string> = { cny: "¥", usd: "$", rub: "₽" };
const TYPE_LABEL: Record<CashOrderType, string> = { income: "Приход", expense: "Расход" };

function money(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const d = new Date(year, monthIndex - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_DRAFT = {
  date: todayIso(),
  accountId: "",
  categoryId: "",
  clientId: "",
  quoteId: "",
  currency: "cny" as CashCurrency,
  amount: "",
  cnyToCurrencyRate: "1",
  comment: "",
};

const EMPTY_TRANSFER_DRAFT = {
  date: todayIso(),
  fromAccountId: "",
  toAccountId: "",
  currency: "cny" as CashCurrency,
  amount: "",
  cnyToCurrencyRate: "1",
  comment: "",
};

function ManagerCashTab() {
  const [month, setMonth] = useState(currentMonth());
  const [categories, setCategories] = useState<CashCategoryRecord[]>([]);
  const [orders, setOrders] = useState<CashOrderRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [investors, setInvestors] = useState<InvestorOption[]>([]);

  const [filterCategoryId, setFilterCategoryId] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterClientId, setFilterClientId] = useState<string>("all");
  // Счета (см. CashAccount) — "all" сводит ленту/summary по ВСЕМ счетам,
  // как и раньше до их появления; конкретный счёт сужает и то, и другое,
  // плюс определяет, какой счёт "Остаток на начало периода" редактирует
  // (см. openObDialog ниже) и на какой счёт по умолчанию попадёт новый
  // ордер. См. PB-V5 chat 2026-08-08.
  const [filterAccountId, setFilterAccountId] = useState<string>("all");

  const incomeCategories = categories.filter((c) => c.type === "income");
  const expenseCategories = categories.filter((c) => c.type === "expense");

  const loadCategories = useCallback(async () => {
    const res = await fetch("/api/manager-cash-categories");
    const data = await res.json();
    if (res.ok) setCategories(data.categories);
  }, []);

  const loadClients = useCallback(async () => {
    const res = await fetch("/api/manager-clients");
    const data = await res.json();
    if (res.ok) setClients(data.clients);
  }, []);

  const loadInvestors = useCallback(async () => {
    const res = await fetch("/api/manager-investors");
    const data = await res.json();
    if (res.ok) setInvestors(data.investors);
  }, []);

  const [accounts, setAccounts] = useState<CashAccountRecord[]>([]);
  const [totalBalanceCny, setTotalBalanceCny] = useState(0);
  const loadAccounts = useCallback(async () => {
    const res = await fetch("/api/manager-cash-accounts");
    const data = await res.json();
    if (res.ok) {
      setAccounts(data.accounts);
      setTotalBalanceCny(data.totalBalanceCny);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (filterCategoryId !== "all") params.set("categoryId", filterCategoryId);
      if (filterType !== "all") params.set("type", filterType);
      if (filterClientId !== "all") params.set("clientId", filterClientId);
      if (filterAccountId !== "all") params.set("accountId", filterAccountId);
      const res = await fetch(`/api/manager-cash-orders?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setOrders(data.orders);
        setSummary(data.summary);
      }
    } finally {
      setLoading(false);
    }
  }, [month, filterCategoryId, filterType, filterClientId, filterAccountId]);

  useEffect(() => {
    loadCategories();
    loadClients();
    loadInvestors();
    loadAccounts();
  }, [loadCategories, loadClients, loadInvestors, loadAccounts]);

  // Только для подсказки у "Просчёт" — засчитается ли сумма в прибыль
  // сразу (только руководителю/старшему менеджеру, см. cash-order-profit-
  // sync.ts) или нет. Ни на что другое здесь роль не влияет — сервер
  // проверяет права заново на каждый запрос независимо от этого стейта.
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/manager-me")
      .then((res) => res.json())
      .then((d) => setCurrentRole(d.role ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // --- Order dialog (create / edit) ---
  const [dialogType, setDialogType] = useState<CashOrderType | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [showNewCategoryForm, setShowNewCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);

  // Quotes of the currently-selected client, for the optional "Просчёт"
  // picker — lets the amount auto-suggestion (below) scope to ONE deal
  // instead of the client's whole history. Refetched whenever the client
  // picker changes; cleared (not just left stale) while loading so a quote
  // from the PREVIOUS client can never stay selectable. See PB-V5 chat
  // 2026-08-06.
  const [clientQuotes, setClientQuotes] = useState<ClientQuoteOption[]>([]);
  useEffect(() => {
    if (!dialogType || !draft.clientId) {
      setClientQuotes([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/manager-quotes?clientId=${draft.clientId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setClientQuotes(
          (data.quotes ?? []).map(
            (q: { id: string; displayId: number; productName: string; buyoutFactConfirmed: boolean }) => ({
              id: q.id,
              displayId: q.displayId,
              productName: q.productName,
              buyoutFactConfirmed: q.buyoutFactConfirmed,
            }),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setClientQuotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [dialogType, draft.clientId]);

  function openCreateDialog(type: CashOrderType) {
    setDialogType(type);
    setEditingOrderId(null);
    setDraft({
      ...EMPTY_DRAFT,
      // Если сейчас смотрим ленту одного счёта — новый ордер по умолчанию
      // на нём же; иначе первый по списку (Александр).
      accountId: (filterAccountId !== "all" ? filterAccountId : accounts[0]?.id) ?? "",
      categoryId: (type === "income" ? incomeCategories : expenseCategories)[0]?.id ?? "",
    });
    setDialogError(null);
    setShowNewCategoryForm(false);
    setShowNewClientForm(false);
  }

  function openEditDialog(order: CashOrderRecord) {
    setDialogType(order.type);
    setEditingOrderId(order.id);
    setDraft({
      date: order.date.slice(0, 10),
      accountId: order.accountId,
      categoryId: order.categoryId,
      clientId: order.clientId ?? "",
      quoteId: order.quoteId ?? "",
      currency: order.currency,
      amount: order.amount,
      cnyToCurrencyRate: order.cnyToCurrencyRate,
      comment: order.comment,
    });
    setDialogError(null);
    setShowNewCategoryForm(false);
    setShowNewClientForm(false);
  }

  function closeDialog() {
    setDialogType(null);
    setEditingOrderId(null);
  }

  // rate = how many units of `currency` equal 1 ¥ ("1 ¥ = X ₽/$") — the
  // same quoting direction as the existing "Курс юаня" fields in Тарифы —
  // so converting a foreign-currency amount INTO ¥ divides by the rate.
  const previewAmountCny = useMemo(() => {
    const amount = Number(draft.amount);
    const rate = draft.currency === "cny" ? 1 : Number(draft.cnyToCurrencyRate);
    if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0) return null;
    return amount / rate;
  }, [draft.amount, draft.cnyToCurrencyRate, draft.currency]);

  // "Расходный ордер": once both статья (linked to an investor or "менеджер,
  // закреплённый за клиентом" — see CashCategory.payoutTarget) and клиент
  // are picked, pull in how much that recipient is actually owed for this
  // client's confirmed deals instead of making the owner compute an
  // investor's share or a manager's premium by hand every time — narrowed
  // to ONE deal if a конкретный просчёт is also picked (see the "Просчёт"
  // selector above). "Приходный ордер" mirrors this once a просчёт is
  // picked: how much of THAT quote's total the client still hasn't paid
  // (see income-suggestion/route.ts) — no suggestion at all for income
  // without a quote, since "how much does the client owe overall" isn't a
  // single well-defined number the way a per-deal payout is. Only on a NEW
  // order (never overwrites a real historical order being edited), and
  // re-fires every time any of the three pickers changes. See PB-V5 chat
  // 2026-08-05, 2026-08-06.
  const [suggestionNote, setSuggestionNote] = useState<string | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  useEffect(() => {
    if (editingOrderId || !dialogType || !draft.clientId) {
      setSuggestionNote(null);
      return;
    }
    let url: string | null = null;
    if (dialogType === "expense" && draft.categoryId) {
      url = `/api/manager-cash-orders/expense-suggestion?categoryId=${draft.categoryId}&clientId=${draft.clientId}${draft.quoteId ? `&quoteId=${draft.quoteId}` : ""}`;
    } else if (dialogType === "income" && draft.quoteId) {
      url = `/api/manager-cash-orders/income-suggestion?clientId=${draft.clientId}&quoteId=${draft.quoteId}`;
    }
    if (!url) {
      setSuggestionNote(null);
      return;
    }
    let cancelled = false;
    setSuggestionLoading(true);
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.applicable) {
          if (!cancelled) setSuggestionNote(null);
          return;
        }
        if (data.amountCny !== null) {
          setDraft((d) => ({ ...d, currency: "cny", cnyToCurrencyRate: "1", amount: String(Math.round(data.amountCny * 100) / 100) }));
        }
        setSuggestionNote(data.note ?? null);
      })
      .finally(() => {
        if (!cancelled) setSuggestionLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editingOrderId/dialogType checked above, re-fetch only on the three pickers changing
  }, [draft.categoryId, draft.clientId, draft.quoteId]);

  async function handleCreateCategory() {
    if (!dialogType || !newCategoryName.trim()) return;
    const res = await fetch("/api/manager-cash-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: dialogType, name: newCategoryName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setDialogError(data.error ?? "Не удалось добавить статью.");
      return;
    }
    setNewCategoryName("");
    setShowNewCategoryForm(false);
    await loadCategories();
    setDraft((d) => ({ ...d, categoryId: data.category.id }));
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
        setDialogError(data.error ?? "Не удалось создать клиента.");
        return;
      }
      setNewClientName("");
      setNewClientPhone("");
      setShowNewClientForm(false);
      await loadClients();
      setDraft((d) => ({ ...d, clientId: data.client.id }));
    } finally {
      setCreatingClient(false);
    }
  }

  async function handleSaveOrder() {
    if (!dialogType) return;
    if (!draft.accountId) {
      setDialogError("Укажите счёт.");
      return;
    }
    if (!draft.categoryId) {
      setDialogError("Укажите статью.");
      return;
    }
    if (!draft.amount || Number(draft.amount) <= 0) {
      setDialogError("Укажите сумму.");
      return;
    }
    setSaving(true);
    setDialogError(null);
    try {
      const body = {
        type: dialogType,
        date: draft.date,
        accountId: draft.accountId,
        categoryId: draft.categoryId,
        clientId: draft.clientId || null,
        quoteId: draft.quoteId || null,
        currency: draft.currency,
        amount: Number(draft.amount),
        cnyToCurrencyRate: draft.currency === "cny" ? 1 : Number(draft.cnyToCurrencyRate),
        comment: draft.comment,
      };
      const res = editingOrderId
        ? await fetch(`/api/manager-cash-orders/${editingOrderId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/manager-cash-orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const data = await res.json();
      if (!res.ok) {
        setDialogError(data.error ?? "Не удалось сохранить ордер.");
        return;
      }
      closeDialog();
      await Promise.all([loadOrders(), loadAccounts()]);
    } catch {
      setDialogError("Не удалось связаться с сервером.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteOrder(id: string) {
    if (!window.confirm("Удалить этот ордер?")) return;
    const res = await fetch(`/api/manager-cash-orders/${id}`, { method: "DELETE" });
    if (res.ok) await Promise.all([loadOrders(), loadAccounts()]);
  }

  async function handleExport() {
    const res = await fetch(`/api/manager-cash-orders/export-excel?month=${month}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Кассовый отчёт — ${month}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Opening balance dialog ---
  const [obOpen, setObOpen] = useState(false);
  const [obDate, setObDate] = useState(todayIso());
  const [obAmount, setObAmount] = useState("0");
  const [obSaving, setObSaving] = useState(false);
  const [obError, setObError] = useState<string | null>(null);

  // Якорь теперь на СЧЁТ (см. CashOpeningBalance.accountId) — редактируется
  // только когда в фильтре выбран конкретный счёт (иначе непонятно, чей
  // именно якорь двигать); см. кнопку-шестерёнку в карточке ниже, которая
  // скрыта при filterAccountId==="all".
  async function openObDialog() {
    if (filterAccountId === "all") return;
    const res = await fetch(`/api/manager-cash-opening-balance?accountId=${filterAccountId}`);
    const data = await res.json();
    if (res.ok && data.balance) {
      setObDate(String(data.balance.effectiveDate).slice(0, 10));
      setObAmount(data.balance.amountCny);
    } else {
      setObDate(todayIso());
      setObAmount("0");
    }
    setObError(null);
    setObOpen(true);
  }

  async function handleSaveOb() {
    if (filterAccountId === "all") return;
    setObSaving(true);
    setObError(null);
    try {
      const res = await fetch("/api/manager-cash-opening-balance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: filterAccountId, effectiveDate: obDate, amountCny: Number(obAmount) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setObError(data.error ?? "Не удалось сохранить баланс.");
        return;
      }
      setObOpen(false);
      await Promise.all([loadOrders(), loadAccounts()]);
    } finally {
      setObSaving(false);
    }
  }

  // --- Перевод между счетами (см. CashTransfer) ---
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferDraft, setTransferDraft] = useState(EMPTY_TRANSFER_DRAFT);
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<CashTransferRecord[]>([]);

  const loadTransfers = useCallback(async () => {
    const res = await fetch(`/api/manager-cash-transfers?month=${month}`);
    const data = await res.json();
    if (res.ok) setTransfers(data.transfers);
  }, [month]);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  // Перевод раньше был виден только в отдельной свёрнутой "Истории
  // переводов" ниже основной ленты — легко было решить, что перевод вообще
  // никуда не записался, если не знать, что эта секция там есть. Теперь
  // одна общая лента, отсортированная по дате: перевод попадает в неё же
  // строкой (не приход/расход — деньги остаются внутри компании, просто
  // между Счёт'ами), отфильтрованной так же по выбранному счёту (перевод
  // виден, если счёт — участник хотя бы с одной стороны). См. PB-V5 chat
  // 2026-08-11.
  type CashLedgerRow =
    | { kind: "order"; id: string; date: string; order: CashOrderRecord }
    | { kind: "transfer"; id: string; date: string; transfer: CashTransferRecord };
  const ledgerRows = useMemo<CashLedgerRow[]>(() => {
    const orderRows: CashLedgerRow[] = orders.map((o) => ({ kind: "order", id: o.id, date: o.date, order: o }));
    const transferRows: CashLedgerRow[] = transfers
      .filter((t) => filterAccountId === "all" || t.fromAccount.id === filterAccountId || t.toAccount.id === filterAccountId)
      .map((t) => ({ kind: "transfer", id: t.id, date: t.date, transfer: t }));
    return [...orderRows, ...transferRows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [orders, transfers, filterAccountId]);

  function openTransferDialog() {
    setTransferDraft({
      ...EMPTY_TRANSFER_DRAFT,
      fromAccountId: accounts[0]?.id ?? "",
      toAccountId: accounts[1]?.id ?? "",
    });
    setTransferError(null);
    setTransferOpen(true);
  }

  async function handleSaveTransfer() {
    if (!transferDraft.fromAccountId || !transferDraft.toAccountId) {
      setTransferError("Укажите оба счёта.");
      return;
    }
    if (transferDraft.fromAccountId === transferDraft.toAccountId) {
      setTransferError("Счета списания и зачисления должны различаться.");
      return;
    }
    if (!transferDraft.amount || Number(transferDraft.amount) <= 0) {
      setTransferError("Укажите сумму.");
      return;
    }
    setTransferSaving(true);
    setTransferError(null);
    try {
      const res = await fetch("/api/manager-cash-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: transferDraft.date,
          fromAccountId: transferDraft.fromAccountId,
          toAccountId: transferDraft.toAccountId,
          currency: transferDraft.currency,
          amount: Number(transferDraft.amount),
          cnyToCurrencyRate: transferDraft.currency === "cny" ? 1 : Number(transferDraft.cnyToCurrencyRate),
          comment: transferDraft.comment,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTransferError(data.error ?? "Не удалось сохранить перевод.");
        return;
      }
      setTransferOpen(false);
      await Promise.all([loadAccounts(), loadTransfers()]);
    } catch {
      setTransferError("Не удалось связаться с сервером.");
    } finally {
      setTransferSaving(false);
    }
  }

  async function handleDeleteTransfer(id: string) {
    if (!window.confirm("Удалить этот перевод?")) return;
    const res = await fetch(`/api/manager-cash-transfers/${id}`, { method: "DELETE" });
    if (res.ok) await Promise.all([loadAccounts(), loadTransfers()]);
  }

  // --- Category management panel ---
  const [showCategoryPanel, setShowCategoryPanel] = useState(false);
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null);
  const [categoryPanelError, setCategoryPanelError] = useState<string | null>(null);

  async function handleRenameCategory(id: string, currentName: string) {
    const draft = categoryDrafts[id];
    if (draft === undefined || draft === currentName || !draft.trim()) return;
    setBusyCategoryId(id);
    setCategoryPanelError(null);
    try {
      const res = await fetch(`/api/manager-cash-categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCategoryPanelError(data.error ?? "Не удалось переименовать статью.");
        return;
      }
      await loadCategories();
    } finally {
      setBusyCategoryId(null);
    }
  }

  // Selecting "не привязано" clears both fields; "assigned_manager" needs
  // none; "investor:<id>" carries the chosen investor right in the option
  // value since a native <select> only gives back one string.
  async function handleSetPayoutTarget(id: string, value: string) {
    setBusyCategoryId(id);
    setCategoryPanelError(null);
    try {
      const body =
        value === ""
          ? { payoutTarget: null }
          : value === "assigned_manager"
            ? { payoutTarget: "assigned_manager" }
            : { payoutTarget: "investor", linkedInvestorId: value.slice("investor:".length) };
      const res = await fetch(`/api/manager-cash-categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setCategoryPanelError(data.error ?? "Не удалось привязать статью.");
        return;
      }
      await loadCategories();
    } finally {
      setBusyCategoryId(null);
    }
  }

  // "" -> сброс привязки; иначе значение — одна из шести категорий
  // QuotePaymentAllocation (см. CashCategory.linkedProfitCategory).
  async function handleSetLinkedProfitCategory(id: string, value: string) {
    setBusyCategoryId(id);
    setCategoryPanelError(null);
    try {
      const res = await fetch(`/api/manager-cash-categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedProfitCategory: value || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCategoryPanelError(data.error ?? "Не удалось привязать статью.");
        return;
      }
      await loadCategories();
    } finally {
      setBusyCategoryId(null);
    }
  }

  async function handleDeleteCategory(id: string) {
    if (!window.confirm("Удалить эту статью?")) return;
    setBusyCategoryId(id);
    setCategoryPanelError(null);
    try {
      const res = await fetch(`/api/manager-cash-categories/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setCategoryPanelError(data.error ?? "Не удалось удалить статью.");
        return;
      }
      await loadCategories();
    } finally {
      setBusyCategoryId(null);
    }
  }

  const dialogCategories = dialogType === "income" ? incomeCategories : expenseCategories;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-text">Касса</h2>
          <p className="mt-1 text-sm text-text-secondary">Кассовая книга — приход и расход по статьям, баланс в юанях.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
          <Button type="button" size="sm" variant="ghost" onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      {/* Баланс "прямо сейчас" по каждому счёту + итого — независимо от
          выбранного месяца в ленте ниже (см. computeAccountBalanceCny в
          lib/desk-services/cash-balance.ts). См. PB-V5 chat 2026-08-08. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className={cn("p-4", filterAccountId === "all" ? "ring-1 ring-primary/40" : "")}>
          <button type="button" onClick={() => setFilterAccountId("all")} className="w-full text-left">
            <p className="text-xs text-text-secondary">Итого по всем счетам</p>
            <p className="mt-1 text-lg font-bold text-text">¥ {money(totalBalanceCny)}</p>
          </button>
        </Card>
        {accounts.map((account) => (
          <Card key={account.id} className={cn("p-4", filterAccountId === account.id ? "ring-1 ring-primary/40" : "")}>
            <button type="button" onClick={() => setFilterAccountId(account.id)} className="w-full text-left">
              <p className="text-xs text-text-secondary">{account.name}</p>
              <p className="mt-1 text-lg font-bold text-text">¥ {money(account.balanceCny)}</p>
            </button>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-secondary">Баланс на начало периода</p>
            {filterAccountId !== "all" && (
              <button type="button" onClick={openObDialog} className="text-text-secondary hover:text-text" aria-label="Настроить начальный баланс">
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="mt-1 text-lg font-bold text-text">{summary ? `¥ ${money(summary.openingBalanceCny)}` : "—"}</p>
          {filterAccountId === "all" && (
            <p className="mt-1 text-[11px] text-text-secondary">Чтобы задать начальный остаток, выберите один счёт выше.</p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-text-secondary">Приход за период</p>
          <p className="mt-1 text-lg font-bold text-success">{summary ? `¥ ${money(summary.incomeCny)}` : "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-text-secondary">Расход за период</p>
          <p className="mt-1 text-lg font-bold text-error">{summary ? `¥ ${money(summary.expenseCny)}` : "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-text-secondary">Баланс на конец периода</p>
          <p className="mt-1 text-lg font-bold text-primary">{summary ? `¥ ${money(summary.closingBalanceCny)}` : "—"}</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => openCreateDialog("income")}>
          <Plus className="h-4 w-4" /> Приходный ордер
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => openCreateDialog("expense")}>
          <Plus className="h-4 w-4" /> Расходный ордер
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={openTransferDialog} disabled={accounts.length < 2}>
          <ArrowLeftRight className="h-4 w-4" /> Перевести между счетами
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={filterAccountId} onValueChange={setFilterAccountId}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все счета</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              <SelectItem value="income">Приход</SelectItem>
              <SelectItem value="expense">Расход</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCategoryId} onValueChange={setFilterCategoryId}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статьи</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {TYPE_LABEL[c.type]}: {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-text-secondary">Загрузка…</p>
      ) : ledgerRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-text-secondary">Операций за этот период пока нет.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-3xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-bg text-left text-xs text-text-secondary">
                <th className="px-3 py-1.5 font-medium">Дата</th>
                <th className="px-3 py-1.5 font-medium">Тип</th>
                <th className="px-3 py-1.5 font-medium">Счёт</th>
                <th className="px-3 py-1.5 font-medium">Статья</th>
                <th className="px-3 py-1.5 font-medium">Клиент</th>
                <th className="px-3 py-1.5 font-medium">Сумма</th>
                <th className="px-3 py-1.5 font-medium">Сумма, ¥</th>
                <th className="px-3 py-1.5 font-medium">Комментарий</th>
                <th className="px-3 py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map((row) =>
                row.kind === "transfer" ? (
                  <tr key={`transfer-${row.id}`} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5 whitespace-nowrap text-text-secondary">
                      {new Date(row.transfer.date).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Перевод</span>
                    </td>
                    <td className="px-3 py-1.5 text-text-secondary">
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        {row.transfer.fromAccount.name}
                        <ArrowLeftRight className="h-3 w-3 shrink-0" />
                        {row.transfer.toAccount.name}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-text-secondary">Перевод между счетами</td>
                    <td className="px-3 py-1.5 text-text-secondary">—</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-text-secondary">
                      {money(Number(row.transfer.amount))} {CURRENCY_LABEL[row.transfer.currency]}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap font-medium text-text">¥ {money(Number(row.transfer.amountCny))}</td>
                    <td className="max-w-50 truncate px-3 py-1.5 text-text-secondary" title={row.transfer.comment}>
                      {row.transfer.comment}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteTransfer(row.transfer.id)}
                          className="text-text-secondary hover:text-error"
                          aria-label="Удалить перевод"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                <tr key={`order-${row.id}`} className="border-b border-border last:border-0">
                  <td className="px-3 py-1.5 whitespace-nowrap text-text-secondary">
                    {new Date(row.order.date).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        row.order.type === "income" ? "bg-success/10 text-success" : "bg-error/10 text-error",
                      )}
                    >
                      {TYPE_LABEL[row.order.type]}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-text-secondary">{row.order.account.name}</td>
                  <td className="px-3 py-1.5 text-text">{row.order.category.name}</td>
                  <td className="px-3 py-1.5 text-text-secondary">
                    {row.order.client?.name ?? "—"}
                    {row.order.quote && (
                      <span className="block text-xs text-text-secondary/70">№{row.order.quote.displayId} — {row.order.quote.productName}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-text-secondary">
                    {money(Number(row.order.amount))} {CURRENCY_LABEL[row.order.currency]}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap font-medium text-text">¥ {money(Number(row.order.amountCny))}</td>
                  <td className="max-w-50 truncate px-3 py-1.5 text-text-secondary" title={row.order.comment}>
                    {row.order.comment}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={() => openEditDialog(row.order)} className="text-text-secondary hover:text-text" aria-label="Редактировать">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteOrder(row.order.id)}
                        className="text-text-secondary hover:text-error"
                        aria-label="Удалить"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setShowCategoryPanel((v) => !v)}
          className="text-xs font-semibold text-text-secondary hover:text-text"
        >
          {showCategoryPanel ? "Скрыть статьи" : "Управлять статьями"}
        </button>
        {showCategoryPanel && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {(["income", "expense"] as const).map((type) => (
              <div key={type}>
                <p className="text-xs font-semibold text-text-secondary">{TYPE_LABEL[type]}</p>
                <div className="mt-1.5 space-y-1.5">
                  {categories
                    .filter((c) => c.type === type)
                    .map((c) => (
                      <div key={c.id} className="space-y-1 rounded-lg border border-border bg-bg px-2.5 py-1.5">
                        <div className="flex items-center gap-2">
                          <Input
                            value={categoryDrafts[c.id] ?? c.name}
                            onChange={(e) => setCategoryDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                            onBlur={() => handleRenameCategory(c.id, c.name)}
                            disabled={busyCategoryId === c.id}
                            className="h-8 min-w-0 flex-1 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(c.id)}
                            disabled={busyCategoryId === c.id}
                            className="shrink-0 text-text-secondary hover:text-error disabled:opacity-50"
                            aria-label="Удалить статью"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {type === "expense" && (
                          <select
                            value={c.payoutTarget === "investor" ? `investor:${c.linkedInvestorId}` : (c.payoutTarget ?? "")}
                            onChange={(e) => handleSetPayoutTarget(c.id, e.target.value)}
                            disabled={busyCategoryId === c.id}
                            className="h-7 w-full rounded-md border border-border bg-surface px-2 text-xs text-text disabled:opacity-50"
                          >
                            <option value="">Сумма не подставляется автоматически</option>
                            <option value="assigned_manager">Менеджер, закреплённый за клиентом</option>
                            {investors.map((inv) => (
                              <option key={inv.id} value={`investor:${inv.id}`}>
                                Инвестор: {inv.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {type === "income" && (
                          <select
                            value={c.linkedProfitCategory ?? ""}
                            onChange={(e) => handleSetLinkedProfitCategory(c.id, e.target.value)}
                            disabled={busyCategoryId === c.id}
                            className="h-7 w-full rounded-md border border-border bg-surface px-2 text-xs text-text disabled:opacity-50"
                          >
                            <option value="">Не засчитывается в прибыль автоматически</option>
                            {(Object.keys(PROFIT_CATEGORY_LABEL) as QuotePaymentCategoryValue[]).map((key) => (
                              <option key={key} value={key}>
                                Сразу в прибыль: {PROFIT_CATEGORY_LABEL[key]}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ))}
            {categoryPanelError && <p className="sm:col-span-2 text-xs text-error">{categoryPanelError}</p>}
          </div>
        )}
      </div>

      {/* Order create/edit dialog */}
      <Dialog open={dialogType !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingOrderId ? "Редактировать ордер" : dialogType === "income" ? "Приходный ордер" : "Расходный ордер"}
            </DialogTitle>
            <DialogDescription>
              {dialogType === "income" ? "Деньги, которые пришли в кассу." : "Деньги, которые ушли из кассы."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Дата</Label>
              <Input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>Счёт</Label>
              <Select value={draft.accountId} onValueChange={(v) => setDraft((d) => ({ ...d, accountId: v }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Выберите счёт" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Статья</Label>
                {!showNewCategoryForm && (
                  <button type="button" onClick={() => setShowNewCategoryForm(true)} className="text-xs text-primary hover:underline">
                    + новая статья
                  </button>
                )}
              </div>
              {showNewCategoryForm ? (
                <div className="flex gap-2">
                  <Input placeholder="Название статьи" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
                  <Button type="button" size="sm" onClick={handleCreateCategory}>
                    Добавить
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewCategoryForm(false)}>
                    Отмена
                  </Button>
                </div>
              ) : (
                <Select value={draft.categoryId} onValueChange={(v) => setDraft((d) => ({ ...d, categoryId: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Выберите статью" />
                  </SelectTrigger>
                  <SelectContent>
                    {dialogCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {dialogType && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>
                    Клиент{dialogType === "expense" ? " (например, для выкупа за товар)" : ""}
                  </Label>
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
                  <Select value={draft.clientId} onValueChange={(v) => setDraft((d) => ({ ...d, clientId: v, quoteId: "" }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Без привязки к клиенту" />
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
            )}

            {dialogType && draft.clientId && clientQuotes.length > 0 && (
              <div className="space-y-1.5">
                <Label>
                  Просчёт{dialogType === "expense" ? " (необязательно — сузить выплату до одной сделки)" : " (необязательно — за какой просчёт вносятся деньги)"}
                </Label>
                <Select value={draft.quoteId} onValueChange={(v) => setDraft((d) => ({ ...d, quoteId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Без привязки к просчёту" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Без привязки к просчёту</SelectItem>
                    {clientQuotes.map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        №{q.displayId} — {q.productName}
                        {!q.buyoutFactConfirmed ? " (факт не подтверждён)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(() => {
                  if (dialogType !== "income" || !draft.quoteId) return null;
                  const category = dialogCategories.find((c) => c.id === draft.categoryId);
                  if (!category?.linkedProfitCategory) return null;
                  const label = PROFIT_CATEGORY_LABEL[category.linkedProfitCategory];
                  if (draft.currency !== "rub") {
                    return <p className="text-xs text-warning">Автоматически в прибыль засчитываются только суммы в ₽.</p>;
                  }
                  if (currentRole === "owner" || currentRole === "senior") {
                    return <p className="text-xs text-success">✓ Эта сумма сразу засчитается в прибыль — «{label}».</p>;
                  }
                  return (
                    <p className="text-xs text-warning">
                      Эта статья засчитывается в прибыль сразу, но только когда ордер создаёт руководитель или старший
                      менеджер.
                    </p>
                  );
                })()}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label>Валюта</Label>
                <Select
                  value={draft.currency}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, currency: v as CashCurrency, cnyToCurrencyRate: v === "cny" ? "1" : d.cnyToCurrencyRate }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cny">¥ CNY</SelectItem>
                    <SelectItem value="usd">$ USD</SelectItem>
                    <SelectItem value="rub">₽ RUB</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{`1 ¥ = ? ${CURRENCY_LABEL[draft.currency]}`}</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min={0}
                  value={draft.cnyToCurrencyRate}
                  onChange={(e) => setDraft((d) => ({ ...d, cnyToCurrencyRate: e.target.value }))}
                  disabled={draft.currency === "cny"}
                  placeholder={draft.currency === "rub" ? "напр. 12.8" : draft.currency === "usd" ? "напр. 0.14" : undefined}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Сумма</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={draft.amount}
                  onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                />
              </div>
            </div>
            {previewAmountCny !== null && (
              <p className="text-xs text-text-secondary">= ¥ {money(previewAmountCny)}</p>
            )}
            {suggestionLoading && <p className="text-xs text-text-secondary">Считаем сумму к выплате…</p>}
            {!suggestionLoading && suggestionNote && (
              <p className="text-xs text-primary">Сумма подставлена автоматически. {suggestionNote}</p>
            )}

            <div className="space-y-1.5">
              <Label>Комментарий</Label>
              <Input value={draft.comment} onChange={(e) => setDraft((d) => ({ ...d, comment: e.target.value }))} placeholder="Необязательно" />
            </div>

            {dialogError && <p className="text-xs text-error">{dialogError}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={closeDialog}>
              Отмена
            </Button>
            <Button type="button" onClick={handleSaveOrder} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Opening balance dialog */}
      <Dialog open={obOpen} onOpenChange={setObOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Начальный баланс — {accounts.find((a) => a.id === filterAccountId)?.name ?? ""}</DialogTitle>
            <DialogDescription>
              Баланс этого счёта на указанную дату — всё до и после считается автоматически по операциям и переводам.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Дата</Label>
              <Input type="date" value={obDate} onChange={(e) => setObDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Баланс, ¥</Label>
              <Input type="number" step="0.01" value={obAmount} onChange={(e) => setObAmount(e.target.value)} />
            </div>
            {obError && <p className="text-xs text-error">{obError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setObOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={handleSaveOb} disabled={obSaving}>
              {obSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Перевод между счетами</DialogTitle>
            <DialogDescription>Не доход и не расход — просто перекладывает сумму с одного счёта на другой.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Дата</Label>
              <Input type="date" value={transferDraft.date} onChange={(e) => setTransferDraft((d) => ({ ...d, date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Со счёта</Label>
                <Select value={transferDraft.fromAccountId} onValueChange={(v) => setTransferDraft((d) => ({ ...d, fromAccountId: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Выберите счёт" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>На счёт</Label>
                <Select value={transferDraft.toAccountId} onValueChange={(v) => setTransferDraft((d) => ({ ...d, toAccountId: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Выберите счёт" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label>Валюта</Label>
                <Select
                  value={transferDraft.currency}
                  onValueChange={(v) =>
                    setTransferDraft((d) => ({ ...d, currency: v as CashCurrency, cnyToCurrencyRate: v === "cny" ? "1" : d.cnyToCurrencyRate }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cny">¥ CNY</SelectItem>
                    <SelectItem value="usd">$ USD</SelectItem>
                    <SelectItem value="rub">₽ RUB</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Курс (1¥=)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  disabled={transferDraft.currency === "cny"}
                  value={transferDraft.cnyToCurrencyRate}
                  onChange={(e) => setTransferDraft((d) => ({ ...d, cnyToCurrencyRate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Сумма</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={transferDraft.amount}
                  onChange={(e) => setTransferDraft((d) => ({ ...d, amount: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Комментарий</Label>
              <Input
                value={transferDraft.comment}
                onChange={(e) => setTransferDraft((d) => ({ ...d, comment: e.target.value }))}
                placeholder="Необязательно"
              />
            </div>
            {transferError && <p className="text-xs text-error">{transferError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setTransferOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={handleSaveTransfer} disabled={transferSaving}>
              {transferSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Перевести"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { ManagerCashTab };
