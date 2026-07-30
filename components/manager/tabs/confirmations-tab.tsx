"use client";

import { useEffect, useState } from "react";
import { Archive, CheckCircle2, ChevronDown, Loader2, UserCheck, Wallet } from "lucide-react";
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

function fmt(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("ru-RU") : "—";
}

interface ArchivedBuyout {
  id: string;
  displayId: number;
  productName: string;
  totalRub: string;
  totalPriceCny: string;
  actualBuyoutCny: string | null;
  actualBuyoutRateUsed: string | null;
  actualSupplierDiscountCny: string | null;
  actualClientPaymentRub: string | null;
  actualClientPaymentRateUsed: string | null;
  actualClientPaymentCny: number | null;
  servicesAndCommissionCny: number;
  buyoutConfirmedAt: string | null;
  confirmedByManagerName: string | null;
  manager: { id: string; name: string };
  client: { id: string; name: string; company: string | null };
}

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
}

// Archive of already-confirmed buyouts — the "history" counterpart to the
// pending queue above, filterable by manager/client/date so a руководитель
// can audit what's already been confirmed without reopening every client's
// quote list one by one. Collapsed by default (closed <details>-style
// section) since it's a browse/audit tool, not something checked every
// visit the way the pending queue is. See PB-V5 chat 2026-07-29.
function BuyoutArchive() {
  const [open, setOpen] = useState(false);
  const [buyouts, setBuyouts] = useState<ArchivedBuyout[]>([]);
  const [teamManagers, setTeamManagers] = useState<{ id: string; name: string }[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);

  const [managerFilter, setManagerFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    fetch("/api/manager-clients")
      .then((res) => res.json())
      .then((data) => setClients(data.clients ?? []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (managerFilter !== "all") params.set("managerId", managerFilter);
    if (clientFilter !== "all") params.set("clientId", clientFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    fetch(`/api/manager-buyout-archive?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setBuyouts(data.buyouts ?? []);
        setTeamManagers(data.teamManagers ?? []);
      })
      .finally(() => setLoading(false));
  }, [managerFilter, clientFilter, dateFrom, dateTo]);

  return (
    <div className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
          <Archive className="h-3.5 w-3.5" /> Архив подтверждённых выкупов{buyouts.length > 0 ? ` (${buyouts.length})` : ""}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-secondary transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
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

          {loading ? (
            <p className="text-xs text-text-secondary">Загрузка…</p>
          ) : buyouts.length === 0 ? (
            <p className="text-xs text-text-secondary">Ничего не найдено по этим фильтрам.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-275 border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-text-secondary">
                    <th className="py-1.5 pr-3 font-medium">Просчёт</th>
                    <th className="py-1.5 pr-3 font-medium">Клиент</th>
                    <th className="py-1.5 pr-3 font-medium">Менеджер</th>
                    <th className="py-1.5 pr-3 font-medium">Подтверждён</th>
                    <th className="py-1.5 pr-3 font-medium">Кем</th>
                    <th className="py-1.5 pr-3 font-medium">Выкуп факт, ¥</th>
                    <th className="py-1.5 pr-3 font-medium">Скидка, ¥</th>
                    <th className="py-1.5 pr-3 font-medium">Услуги и комиссия, ¥</th>
                    <th className="py-1.5 pr-3 font-medium">Курс на оплате</th>
                    <th className="py-1.5 pr-3 font-medium">Оплата, ¥</th>
                    <th className="py-1.5 font-medium">Оплата, ₽</th>
                  </tr>
                </thead>
                <tbody>
                  {buyouts.map((b) => (
                    <tr key={b.id} className="border-b border-border last:border-0">
                      <td className="py-1.5 pr-3 text-text">
                        №{b.displayId} · {b.productName}
                      </td>
                      <td className="py-1.5 pr-3 text-text-secondary">
                        {b.client.name}
                        {b.client.company ? ` · ${b.client.company}` : ""}
                      </td>
                      <td className="py-1.5 pr-3 text-text-secondary">{b.manager.name}</td>
                      <td className="py-1.5 pr-3 text-text-secondary">{b.buyoutConfirmedAt ? formatDate(b.buyoutConfirmedAt) : "—"}</td>
                      <td className="py-1.5 pr-3 text-text-secondary">{b.confirmedByManagerName ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-text-secondary">{b.actualBuyoutCny ? fmt(Number(b.actualBuyoutCny)) : "—"}</td>
                      <td className="py-1.5 pr-3 text-text-secondary">
                        {b.actualSupplierDiscountCny ? fmt(Number(b.actualSupplierDiscountCny)) : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-text-secondary">{fmt(b.servicesAndCommissionCny)}</td>
                      <td className="py-1.5 pr-3 text-text-secondary">
                        {b.actualClientPaymentRateUsed ? `1¥ = ${Number(b.actualClientPaymentRateUsed).toFixed(2)}₽` : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-text-secondary">
                        {b.actualClientPaymentCny !== null ? fmt(b.actualClientPaymentCny) : "—"}
                      </td>
                      <td className="py-1.5 text-text-secondary">{b.actualClientPaymentRub ? fmt(Number(b.actualClientPaymentRub)) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ManagerConfirmationsTab() {
  const [pendingBuyouts, setPendingBuyouts] = useState<PendingBuyout[]>([]);
  const [pendingClients, setPendingClients] = useState<PendingClient[]>([]);
  const [loading, setLoading] = useState(true);

  const [drafts, setDrafts] = useState<Record<string, { cny: string; rate: string; rub: string; rateRub: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    return fetch("/api/manager-confirmations")
      .then((res) => res.json())
      .then((data) => {
        setPendingBuyouts(data.pendingBuyouts ?? []);
        setPendingClients(data.pendingClients ?? []);
      })
      .finally(() => setLoading(false));
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

  const isEmpty = pendingBuyouts.length === 0 && pendingClients.length === 0;

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

      <BuyoutArchive />
    </div>
  );
}

export { ManagerConfirmationsTab };
