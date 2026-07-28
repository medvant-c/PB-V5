"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, UserCheck, Wallet } from "lucide-react";
import { EmptyState } from "@/components/desk/empty-state";

interface PendingBuyout {
  id: string;
  displayId: number;
  productName: string;
  status: string;
  statusChangedAt: string;
  totalPriceCny: string;
  totalRub: string;
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

function ManagerConfirmationsTab() {
  const [pendingBuyouts, setPendingBuyouts] = useState<PendingBuyout[]>([]);
  const [pendingClients, setPendingClients] = useState<PendingClient[]>([]);
  const [loading, setLoading] = useState(true);

  const [drafts, setDrafts] = useState<Record<string, { cny: string; rate: string; discount: string; rub: string; rateRub: string }>>({});
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
    const draft = drafts[quoteId] ?? { cny: "", rate: "", discount: "", rub: "", rateRub: "" };
    const cny = Number(draft.cny);
    const rate = Number(draft.rate);
    const rub = Number(draft.rub);
    const rateRub = Number(draft.rateRub);
    if (!Number.isFinite(cny) || cny <= 0 || !Number.isFinite(rate) || rate <= 0) return;
    if (!Number.isFinite(rub) || rub <= 0 || !Number.isFinite(rateRub) || rateRub <= 0) return;
    setBusyId(quoteId);
    setError(null);
    try {
      const res = await fetch(`/api/manager-quotes/${quoteId}/confirm-buyout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualBuyoutCny: cny,
          actualBuyoutRateUsed: rate,
          actualSupplierDiscountCny: draft.discount ? Number(draft.discount) : undefined,
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
                  const draft = drafts[quote.id] ?? { cny: "", rate: "", discount: "", rub: "", rateRub: "" };
                  const days = daysWaiting(quote.statusChangedAt);
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
                      <p className="mt-1 text-xs text-text-secondary">
                        По плану: {quote.totalPriceCny}¥ · {Number(quote.totalRub).toLocaleString("ru-RU")}₽
                      </p>
                      <div className="mt-2 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="w-44 shrink-0 text-xs text-text-secondary">Потрачено на выкуп:</span>
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
                          <input
                            type="number"
                            step="0.01"
                            placeholder="скидка поставщика, ¥ (необязательно)"
                            value={draft.discount}
                            onChange={(e) => setDrafts((current) => ({ ...current, [quote.id]: { ...draft, discount: e.target.value } }))}
                            className="w-56 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="w-44 shrink-0 text-xs text-text-secondary">Поступило от клиента:</span>
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
    </div>
  );
}

export { ManagerConfirmationsTab };
