"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, CheckCircle2, ChevronDown, Coins, DollarSign, Loader2, Paperclip, Percent, Ruler, UserCheck, Wallet } from "lucide-react";
import { EmptyState } from "@/components/desk/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface PendingBuyout {
  id: string;
  displayId: number;
  productName: string;
  status: string;
  statusChangedAt: string;
  totalPriceCny: string;
  totalRub: string;
  searchServiceFeeRub: string;
  customProductionFeeRub: string;
  buyoutCommissionRub: string;
  cnyRateUsed: string;
  manager: { id: string; name: string };
  client: { name: string; company: string | null };
}

interface PendingClient {
  id: string;
  displayId: number;
  name: string;
  company: string | null;
  selfSourcedClaimedAt: string | null;
  createdByManager: { id: string; name: string } | null;
}

interface PendingCargoRate {
  id: string;
  displayId: number;
  productName: string;
  createdAt: string;
  cargoRateUsd: string;
  cargoRateUsdOverride: string;
  deliveryPricingMode: string;
  manager: { id: string; name: string };
  client: { name: string; company: string | null };
}

interface PendingCnyRate {
  id: string;
  displayId: number;
  productName: string;
  createdAt: string;
  cnyRateUsed: string;
  cnyRateRubOverride: string;
  manager: { id: string; name: string };
  client: { name: string; company: string | null };
}

interface PendingUsdRate {
  id: string;
  displayId: number;
  productName: string;
  createdAt: string;
  usdRateUsed: string;
  usdRateRubOverride: string;
  manager: { id: string; name: string };
  client: { name: string; company: string | null };
}

interface PendingBuyoutCommission {
  id: string;
  displayId: number;
  productName: string;
  createdAt: string;
  buyoutCommissionPercent: string;
  buyoutCommissionPercentOverride: string;
  manager: { id: string; name: string };
  client: { name: string; company: string | null };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU");
}

// Waited longest first — same "don't let it go stale" instinct as the
// in_progress banner in clients-tab.tsx, just applied to a queue instead of
// a single row's own age.
function daysWaiting(value: string): number {
  return Math.floor((Date.now() - new Date(value).getTime()) / (24 * 60 * 60 * 1000));
}

// Some mobile keyboards (Russian locale) insert a comma as the decimal
// separator into a type="number" input instead of a period — Number()
// silently returns NaN for "12,8", which then fails validation with no
// visible explanation. Normalized at every read site, not just on submit.
function parseNum(value: string): number {
  return Number(value.replace(",", "."));
}

// Live client-side mirror of the server formula in confirm-buyout/route.ts —
// purely a preview so the person confirming sees «Скидка» update as they
// type, before it's actually computed and stored server-side on submit.
function previewDiscountCny(
  quote: PendingBuyout,
  draft: { cny: string; rate: string; rub: string; rateRub: string },
): number | null {
  const buyoutCny = parseNum(draft.cny);
  const paymentRub = parseNum(draft.rub);
  const paymentRate = parseNum(draft.rateRub);
  if (!Number.isFinite(buyoutCny) || buyoutCny <= 0) return null;
  if (!Number.isFinite(paymentRub) || paymentRub <= 0 || !Number.isFinite(paymentRate) || paymentRate <= 0) return null;
  const paymentAmountCny = paymentRub / paymentRate;
  const servicesAndCommissionCny =
    (Number(quote.searchServiceFeeRub) + Number(quote.buyoutCommissionRub) + Number(quote.customProductionFeeRub)) /
    Number(quote.cnyRateUsed);
  return paymentAmountCny - servicesAndCommissionCny - buyoutCny;
}

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
}

type ArchiveEntryType = "buyout" | "cargo_rate" | "cny_rate" | "usd_rate" | "buyout_commission" | "self_sourced_client";

interface ArchiveEntry {
  type: ArchiveEntryType;
  id: string;
  displayId: number;
  label: string;
  summary: string;
  confirmedAt: string;
  confirmedByManagerName: string | null;
  manager: { id: string; name: string };
  client: { id: string; name: string; company: string | null };
  proofFileId: string | null;
}

const ARCHIVE_TYPE_LABEL: Record<ArchiveEntryType, string> = {
  buyout: "Выкуп",
  cargo_rate: "Ставка карго",
  cny_rate: "Курс юаня",
  usd_rate: "Курс доллара",
  buyout_commission: "Комиссия за выкуп",
  self_sourced_client: "Личный клиент",
};

// Combined archive of every already-confirmed item (buyout facts, manual
// cargo rates, manual ¥→₽ rates, self-sourced clients) — the "already
// handled" counterpart to the pending queue above, filterable by
// type/manager/client/date so a руководитель can audit anything already
// confirmed without reopening every client's quote list one by one.
// Collapsed by default (closed <details>-style section) since it's a
// browse/audit tool, not something checked every visit the way the
// pending queue is. One list for every confirmation type, not four
// separate archives — see PB-V5 chat 2026-07-30 ("зачем велосипед
// изобретать — туда же переноси все подтверждения любые списком").
// "Редактировать" and "Удалить" are the same underlying action here: revert
// the confirmation back to pending, where it can be corrected and
// re-confirmed through the exact same form that confirmed it originally
// (or just left there, which is effectively deletion) — no separate edit
// UI to build and keep in sync.
function ConfirmationsArchive({ onReverted }: { onReverted: () => void }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [teamManagers, setTeamManagers] = useState<{ id: string; name: string }[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<ArchiveEntryType | "all">("all");
  const [managerFilter, setManagerFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    fetch("/api/manager-clients")
      .then((res) => res.json())
      .then((data) => setClients(data.clients ?? []));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (managerFilter !== "all") params.set("managerId", managerFilter);
    if (clientFilter !== "all") params.set("clientId", clientFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return fetch(`/api/manager-confirmations-archive?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setEntries(data.entries ?? []);
        setTeamManagers(data.teamManagers ?? []);
      })
      .finally(() => setLoading(false));
  }, [typeFilter, managerFilter, clientFilter, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRevert(entry: ArchiveEntry) {
    if (
      !window.confirm(
        "Отменить это подтверждение? Запись вернётся в очередь подтверждений — там её можно будет исправить и подтвердить заново или просто оставить неподтверждённой.",
      )
    ) {
      return;
    }
    setBusyId(entry.id);
    setError(null);
    try {
      const res = await fetch("/api/manager-confirmations-archive/revert", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: entry.type, id: entry.id }),
      });
      if (res.ok) {
        await load();
        onReverted();
      } else {
        const data = await res.json();
        setError(data.error ?? "Не удалось отменить подтверждение.");
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
          <Archive className="h-3.5 w-3.5" /> Архив подтверждений{entries.length > 0 ? ` (${entries.length})` : ""}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-secondary transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ArchiveEntryType | "all")}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                {(Object.keys(ARCHIVE_TYPE_LABEL) as ArchiveEntryType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {ARCHIVE_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {teamManagers.length > 1 && (
              <Select value={managerFilter} onValueChange={setManagerFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все менеджеры</SelectItem>
                  {teamManagers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={clientFilter} onValueChange={setClientFilter}>
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
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" placeholder="С даты" />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" placeholder="По дату" />
          </div>

          {error && <p className="text-xs text-error">{error}</p>}

          {loading ? (
            <p className="text-xs text-text-secondary">Загрузка…</p>
          ) : entries.length === 0 ? (
            <p className="text-xs text-text-secondary">Ничего не найдено по этим фильтрам.</p>
          ) : (
            <ul className="space-y-1.5">
              {entries.map((entry) => (
                <li
                  key={`${entry.type}-${entry.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg p-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        {ARCHIVE_TYPE_LABEL[entry.type]}
                      </span>
                      <span className="font-medium text-text">
                        №{entry.displayId} · {entry.label}
                      </span>
                      <span className="text-xs text-text-secondary">
                        {entry.client.name}
                        {entry.client.company ? ` · ${entry.client.company}` : ""} · менеджер {entry.manager.name}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-text-secondary">{entry.summary}</p>
                    <p className="text-[11px] text-text-secondary">
                      Подтвердил {entry.confirmedByManagerName ?? "—"} · {formatDate(entry.confirmedAt)}
                      {entry.proofFileId && (
                        <>
                          {" · "}
                          <a
                            href={`/api/manager-quote-rate-proof/${entry.proofFileId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <Paperclip className="h-3 w-3" /> скриншот
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevert(entry)}
                    disabled={busyId === entry.id}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-error/30 hover:text-error disabled:opacity-50"
                  >
                    {busyId === entry.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Отменить подтверждение
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ManagerConfirmationsTab() {
  const [pendingBuyouts, setPendingBuyouts] = useState<PendingBuyout[]>([]);
  const [pendingClients, setPendingClients] = useState<PendingClient[]>([]);
  const [pendingCargoRates, setPendingCargoRates] = useState<PendingCargoRate[]>([]);
  const [pendingCnyRates, setPendingCnyRates] = useState<PendingCnyRate[]>([]);
  const [pendingUsdRates, setPendingUsdRates] = useState<PendingUsdRate[]>([]);
  const [pendingBuyoutCommissions, setPendingBuyoutCommissions] = useState<PendingBuyoutCommission[]>([]);
  const [loading, setLoading] = useState(true);

  const [drafts, setDrafts] = useState<Record<string, { cny: string; rate: string; rub: string; rateRub: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [cargoRateDrafts, setCargoRateDrafts] = useState<Record<string, { cost: string; file: File | null }>>({});
  const [busyCargoRateId, setBusyCargoRateId] = useState<string | null>(null);
  const [cargoRateError, setCargoRateError] = useState<string | null>(null);

  const [cnyRateFiles, setCnyRateFiles] = useState<Record<string, File | null>>({});
  const [busyCnyRateId, setBusyCnyRateId] = useState<string | null>(null);
  const [cnyRateError, setCnyRateError] = useState<string | null>(null);

  const [usdRateFiles, setUsdRateFiles] = useState<Record<string, File | null>>({});
  const [busyUsdRateId, setBusyUsdRateId] = useState<string | null>(null);
  const [usdRateError, setUsdRateError] = useState<string | null>(null);

  const [buyoutCommissionFiles, setBuyoutCommissionFiles] = useState<Record<string, File | null>>({});
  const [busyBuyoutCommissionId, setBusyBuyoutCommissionId] = useState<string | null>(null);
  const [buyoutCommissionError, setBuyoutCommissionError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    return fetch("/api/manager-confirmations")
      .then((res) => res.json())
      .then((data) => {
        setPendingBuyouts(data.pendingBuyouts ?? []);
        setPendingClients(data.pendingClients ?? []);
        setPendingCargoRates(data.pendingCargoRates ?? []);
        setPendingCnyRates(data.pendingCnyRates ?? []);
        setPendingUsdRates(data.pendingUsdRates ?? []);
        setPendingBuyoutCommissions(data.pendingBuyoutCommissions ?? []);
      })
      .finally(() => setLoading(false));
  }

  async function handleConfirmCargoRate(quoteId: string) {
    const draft = cargoRateDrafts[quoteId];
    const cost = parseNum(draft?.cost ?? "");
    if (!Number.isFinite(cost) || cost < 0) {
      setCargoRateError("Укажите цену закупки за 1 кг/м³.");
      return;
    }
    setBusyCargoRateId(quoteId);
    setCargoRateError(null);
    try {
      const formData = new FormData();
      formData.append("cargoRateOverrideCostUsd", String(cost));
      if (draft?.file) formData.append("file", draft.file);
      const res = await fetch(`/api/manager-quotes/${quoteId}/confirm-cargo-rate`, { method: "PATCH", body: formData });
      if (res.ok) {
        setCargoRateDrafts((current) => {
          const { [quoteId]: _omit, ...rest } = current;
          void _omit;
          return rest;
        });
        await load();
      } else {
        const data = await res.json();
        setCargoRateError(data.error ?? "Не удалось подтвердить ставку.");
      }
    } finally {
      setBusyCargoRateId(null);
    }
  }

  async function handleConfirmCnyRate(quoteId: string) {
    const file = cnyRateFiles[quoteId];
    setBusyCnyRateId(quoteId);
    setCnyRateError(null);
    try {
      const formData = new FormData();
      if (file) formData.append("file", file);
      const res = await fetch(`/api/manager-quotes/${quoteId}/confirm-cny-rate`, { method: "PATCH", body: formData });
      if (res.ok) {
        setCnyRateFiles((current) => {
          const { [quoteId]: _omit, ...rest } = current;
          void _omit;
          return rest;
        });
        await load();
      } else {
        const data = await res.json();
        setCnyRateError(data.error ?? "Не удалось подтвердить курс.");
      }
    } finally {
      setBusyCnyRateId(null);
    }
  }

  async function handleConfirmUsdRate(quoteId: string) {
    const file = usdRateFiles[quoteId];
    setBusyUsdRateId(quoteId);
    setUsdRateError(null);
    try {
      const formData = new FormData();
      if (file) formData.append("file", file);
      const res = await fetch(`/api/manager-quotes/${quoteId}/confirm-usd-rate`, { method: "PATCH", body: formData });
      if (res.ok) {
        setUsdRateFiles((current) => {
          const { [quoteId]: _omit, ...rest } = current;
          void _omit;
          return rest;
        });
        await load();
      } else {
        const data = await res.json();
        setUsdRateError(data.error ?? "Не удалось подтвердить курс.");
      }
    } finally {
      setBusyUsdRateId(null);
    }
  }

  async function handleConfirmBuyoutCommission(quoteId: string) {
    const file = buyoutCommissionFiles[quoteId];
    setBusyBuyoutCommissionId(quoteId);
    setBuyoutCommissionError(null);
    try {
      const formData = new FormData();
      if (file) formData.append("file", file);
      const res = await fetch(`/api/manager-quotes/${quoteId}/confirm-buyout-commission`, { method: "PATCH", body: formData });
      if (res.ok) {
        setBuyoutCommissionFiles((current) => {
          const { [quoteId]: _omit, ...rest } = current;
          void _omit;
          return rest;
        });
        await load();
      } else {
        const data = await res.json();
        setBuyoutCommissionError(data.error ?? "Не удалось подтвердить комиссию.");
      }
    } finally {
      setBusyBuyoutCommissionId(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleConfirmBuyout(quoteId: string) {
    const draft = drafts[quoteId] ?? { cny: "", rate: "", rub: "", rateRub: "" };
    const cny = parseNum(draft.cny);
    const rate = parseNum(draft.rate);
    const rub = parseNum(draft.rub);
    const rateRub = parseNum(draft.rateRub);
    if (!Number.isFinite(cny) || cny <= 0) {
      setError("Заполните «Выкуп факт».");
      return;
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      setError("Заполните курс ¥→₽ рядом с «Выкуп факт».");
      return;
    }
    if (!Number.isFinite(rub) || rub <= 0) {
      setError("Заполните «Оплата от клиента».");
      return;
    }
    if (!Number.isFinite(rateRub) || rateRub <= 0) {
      setError("Заполните курс ¥→₽ рядом с «Оплата от клиента».");
      return;
    }
    setBusyId(quoteId);
    setError(null);
    try {
      const res = await fetch(`/api/manager-quotes/${quoteId}/confirm-buyout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualBuyoutCny: cny,
          actualBuyoutRateUsed: rate,
          actualClientPaymentRub: rub,
          actualClientPaymentRateUsed: rateRub,
        }),
      });
      if (res.ok) {
        await load();
      } else {
        const data = await res.json();
        setError(data.error ?? "Не удалось подтвердить факт по выкупу.");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmClient(clientId: string) {
    setBusyId(clientId);
    setError(null);
    try {
      const res = await fetch(`/api/manager-clients/${clientId}/confirm-self-sourced`, { method: "PATCH" });
      if (res.ok) {
        await load();
      } else {
        const data = await res.json();
        setError(data.error ?? "Не удалось подтвердить клиента.");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleRejectClient(clientId: string) {
    if (!window.confirm("Отклонить заявку? Менеджер сможет заявить этого клиента снова.")) return;
    setBusyId(clientId);
    setError(null);
    try {
      const res = await fetch(`/api/manager-clients/${clientId}/reject-self-sourced`, { method: "PATCH" });
      if (res.ok) {
        await load();
      } else {
        const data = await res.json();
        setError(data.error ?? "Не удалось отклонить заявку.");
      }
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-sm text-text-secondary">Загрузка…</p>;

  const isEmpty =
    pendingBuyouts.length === 0 &&
    pendingClients.length === 0 &&
    pendingCargoRates.length === 0 &&
    pendingCnyRates.length === 0 &&
    pendingUsdRates.length === 0 &&
    pendingBuyoutCommissions.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-bold text-text">Очередь подтверждений</h2>
        <p className="mt-1 text-xs text-text-secondary">
          Факты, которые менеджеры внесли или заявили, но которые ещё должен проверить и подтвердить старший
          менеджер или руководитель, прежде чем они попадут в реальную прибыль и премию.
        </p>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      {isEmpty ? (
        <EmptyState icon={CheckCircle2} message="Очередь пуста — все факты и заявки на личных клиентов подтверждены." />
      ) : (
        <>
          {pendingBuyouts.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                <Wallet className="h-3.5 w-3.5" /> Факт по выкупу ({pendingBuyouts.length})
              </h3>
              <p className="mt-1 text-xs text-text-secondary">
                Поступление от клиента автоматически добавится приходным ордером в «Отчёты по дням».
              </p>
              <ul className="mt-2 space-y-2">
                {pendingBuyouts.map((quote) => {
                  // Курс по умолчанию — снапшот с самого просчёта (quote.cnyRateUsed),
                  // а не пустое поле: пока курс не отличался от планового, менеджеру
                  // не нужно ничего вводить руками, только поправить при расхождении.
                  const draft = drafts[quote.id] ?? { cny: "", rate: quote.cnyRateUsed, rub: "", rateRub: quote.cnyRateUsed };
                  const days = daysWaiting(quote.statusChangedAt);
                  const servicesAndCommissionCny =
                    (Number(quote.searchServiceFeeRub) + Number(quote.buyoutCommissionRub) + Number(quote.customProductionFeeRub)) /
                    Number(quote.cnyRateUsed);
                  const discountPreview = previewDiscountCny(quote, draft);
                  return (
                    <li key={quote.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-medium text-text">
                            №{quote.displayId} · {quote.productName}
                          </span>
                          <span className="ml-2 text-xs text-text-secondary">
                            {quote.client.name}
                            {quote.client.company ? ` · ${quote.client.company}` : ""} · менеджер {quote.manager.name}
                          </span>
                        </div>
                        <span className={days >= 3 ? "text-xs font-medium text-error" : "text-xs text-text-secondary"}>
                          ждёт {days} {days === 1 ? "день" : "дн."}
                        </span>
                      </div>

                      <div className="mt-2 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="w-44 shrink-0 text-xs text-text-secondary">Выкуп план (авто):</span>
                          <span className="w-32 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text-secondary">
                            {quote.totalPriceCny}¥
                          </span>
                          <span className="w-44 shrink-0 text-xs text-text-secondary">Выкуп факт (вручную):</span>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="¥ потрачено"
                            value={draft.cny}
                            onChange={(e) => setDrafts((current) => ({ ...current, [quote.id]: { ...draft, cny: e.target.value } }))}
                            className="w-32 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="курс ¥→₽"
                            value={draft.rate}
                            onChange={(e) => setDrafts((current) => ({ ...current, [quote.id]: { ...draft, rate: e.target.value } }))}
                            className="w-28 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="w-44 shrink-0 text-xs text-text-secondary">Услуги, комиссия и произв-во (авто):</span>
                          <span className="w-32 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text-secondary">
                            {servicesAndCommissionCny.toFixed(2)}¥
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="w-44 shrink-0 text-xs text-text-secondary">Оплата от клиента (вручную):</span>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="₽ получено"
                            value={draft.rub}
                            onChange={(e) => setDrafts((current) => ({ ...current, [quote.id]: { ...draft, rub: e.target.value } }))}
                            className="w-32 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="1¥ = ?₽"
                            value={draft.rateRub}
                            onChange={(e) => setDrafts((current) => ({ ...current, [quote.id]: { ...draft, rateRub: e.target.value } }))}
                            className="w-28 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="w-44 shrink-0 text-xs text-text-secondary">Скидка (авто):</span>
                          <span
                            className={
                              discountPreview === null
                                ? "w-32 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text-secondary"
                                : "w-32 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm font-semibold text-success"
                            }
                          >
                            {discountPreview === null ? "—" : `${discountPreview.toFixed(2)}¥`}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleConfirmBuyout(quote.id)}
                          disabled={busyId === quote.id}
                          className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
                        >
                          {busyId === quote.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Подтвердить
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {pendingCargoRates.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                <Ruler className="h-3.5 w-3.5" /> Ручные ставки карго ({pendingCargoRates.length})
              </h3>
              <p className="mt-1 text-xs text-text-secondary">
                Менеджер вписал ставку карго вручную, не из тарифов. Укажите реальную цену закупки за 1 кг/м³
                (скриншот переписки с поставщиком — необязательно, но поможет при проверке).
              </p>
              {cargoRateError && <p className="mt-1 text-xs text-error">{cargoRateError}</p>}
              <ul className="mt-2 space-y-2">
                {pendingCargoRates.map((quote) => {
                  const draft = cargoRateDrafts[quote.id] ?? { cost: "", file: null };
                  const unit = quote.deliveryPricingMode === "density" ? "кг" : "м³";
                  return (
                    <li key={quote.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-medium text-text">
                            №{quote.displayId} · {quote.productName}
                          </span>
                          <span className="ml-2 text-xs text-text-secondary">
                            {quote.client.name}
                            {quote.client.company ? ` · ${quote.client.company}` : ""} · менеджер {quote.manager.name}
                          </span>
                        </div>
                        <span className="text-xs font-medium text-warning">
                          ставка: ${Number(quote.cargoRateUsdOverride).toFixed(2)}/{unit}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="w-52 shrink-0 text-xs text-text-secondary">Цена закупки, $/{unit}:</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={draft.cost}
                          onChange={(e) => setCargoRateDrafts((c) => ({ ...c, [quote.id]: { ...draft, cost: e.target.value } }))}
                          className="w-32 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="w-52 shrink-0 text-xs text-text-secondary">Скриншот переписки (необязательно):</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          onChange={(e) =>
                            setCargoRateDrafts((c) => ({ ...c, [quote.id]: { ...draft, file: e.target.files?.[0] ?? null } }))
                          }
                          className="text-xs text-text-secondary"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleConfirmCargoRate(quote.id)}
                        disabled={busyCargoRateId === quote.id}
                        className="mt-2 flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
                      >
                        {busyCargoRateId === quote.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Подтвердить
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {pendingCnyRates.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                <Coins className="h-3.5 w-3.5" /> Ручной курс юаня ({pendingCnyRates.length})
              </h3>
              <p className="mt-1 text-xs text-text-secondary">
                Менеджер вписал курс ¥→₽ вручную, не из тарифов. Скриншот переписки, подтверждающий, что это
                реальный согласованный курс, — необязательно, но поможет при проверке.
              </p>
              {cnyRateError && <p className="mt-1 text-xs text-error">{cnyRateError}</p>}
              <ul className="mt-2 space-y-2">
                {pendingCnyRates.map((quote) => (
                  <li key={quote.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-medium text-text">
                          №{quote.displayId} · {quote.productName}
                        </span>
                        <span className="ml-2 text-xs text-text-secondary">
                          {quote.client.name}
                          {quote.client.company ? ` · ${quote.client.company}` : ""} · менеджер {quote.manager.name}
                        </span>
                      </div>
                      <span className="text-xs font-medium text-warning">
                        курс: 1¥ = {Number(quote.cnyRateRubOverride).toFixed(2)}₽
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="w-52 shrink-0 text-xs text-text-secondary">Скриншот переписки (необязательно):</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={(e) => setCnyRateFiles((c) => ({ ...c, [quote.id]: e.target.files?.[0] ?? null }))}
                        className="text-xs text-text-secondary"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleConfirmCnyRate(quote.id)}
                      disabled={busyCnyRateId === quote.id}
                      className="mt-2 flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
                    >
                      {busyCnyRateId === quote.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Подтвердить
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pendingUsdRates.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                <DollarSign className="h-3.5 w-3.5" /> Ручной курс доллара ({pendingUsdRates.length})
              </h3>
              <p className="mt-1 text-xs text-text-secondary">
                Менеджер вписал курс $→₽ вручную, не из тарифов. Скриншот переписки, подтверждающий, что это
                реальный согласованный курс, — необязательно, но поможет при проверке.
              </p>
              {usdRateError && <p className="mt-1 text-xs text-error">{usdRateError}</p>}
              <ul className="mt-2 space-y-2">
                {pendingUsdRates.map((quote) => (
                  <li key={quote.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-medium text-text">
                          №{quote.displayId} · {quote.productName}
                        </span>
                        <span className="ml-2 text-xs text-text-secondary">
                          {quote.client.name}
                          {quote.client.company ? ` · ${quote.client.company}` : ""} · менеджер {quote.manager.name}
                        </span>
                      </div>
                      <span className="text-xs font-medium text-warning">
                        курс: 1$ = {Number(quote.usdRateRubOverride).toFixed(2)}₽
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="w-52 shrink-0 text-xs text-text-secondary">Скриншот переписки (необязательно):</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={(e) => setUsdRateFiles((c) => ({ ...c, [quote.id]: e.target.files?.[0] ?? null }))}
                        className="text-xs text-text-secondary"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleConfirmUsdRate(quote.id)}
                      disabled={busyUsdRateId === quote.id}
                      className="mt-2 flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
                    >
                      {busyUsdRateId === quote.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Подтвердить
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pendingBuyoutCommissions.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                <Percent className="h-3.5 w-3.5" /> Ручная комиссия за выкуп ({pendingBuyoutCommissions.length})
              </h3>
              <p className="mt-1 text-xs text-text-secondary">
                Менеджер вписал комиссию за выкуп вручную, не из тарифов. Скриншот переписки, подтверждающий, что это
                реально согласованная комиссия, — необязательно, но поможет при проверке.
              </p>
              {buyoutCommissionError && <p className="mt-1 text-xs text-error">{buyoutCommissionError}</p>}
              <ul className="mt-2 space-y-2">
                {pendingBuyoutCommissions.map((quote) => (
                  <li key={quote.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-medium text-text">
                          №{quote.displayId} · {quote.productName}
                        </span>
                        <span className="ml-2 text-xs text-text-secondary">
                          {quote.client.name}
                          {quote.client.company ? ` · ${quote.client.company}` : ""} · менеджер {quote.manager.name}
                        </span>
                      </div>
                      <span className="text-xs font-medium text-warning">
                        комиссия: {Number(quote.buyoutCommissionPercentOverride).toFixed(2)}%
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="w-52 shrink-0 text-xs text-text-secondary">Скриншот переписки (необязательно):</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={(e) => setBuyoutCommissionFiles((c) => ({ ...c, [quote.id]: e.target.files?.[0] ?? null }))}
                        className="text-xs text-text-secondary"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleConfirmBuyoutCommission(quote.id)}
                      disabled={busyBuyoutCommissionId === quote.id}
                      className="mt-2 flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
                    >
                      {busyBuyoutCommissionId === quote.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Подтвердить
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pendingClients.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                <UserCheck className="h-3.5 w-3.5" /> Личные клиенты ({pendingClients.length})
              </h3>
              <ul className="mt-2 space-y-2">
                {pendingClients.map((client) => (
                  <li key={client.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
                    <div>
                      <span className="font-medium text-text">
                        №{client.displayId} · {client.name}
                        {client.company ? ` · ${client.company}` : ""}
                      </span>
                      <span className="ml-2 text-xs text-text-secondary">
                        заявил {client.createdByManager?.name ?? "—"}
                        {client.selfSourcedClaimedAt ? ` · ${formatDate(client.selfSourcedClaimedAt)}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRejectClient(client.id)}
                        disabled={busyId === client.id}
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-error/30 hover:text-error disabled:opacity-50"
                      >
                        Отклонить
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirmClient(client.id)}
                        disabled={busyId === client.id}
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
                      >
                        {busyId === client.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Подтвердить
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <ConfirmationsArchive onReverted={load} />
    </div>
  );
}

export { ManagerConfirmationsTab };
