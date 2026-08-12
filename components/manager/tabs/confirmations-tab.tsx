"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Banknote, CheckCircle2, ChevronDown, Loader2, Paperclip, UserCheck, UserPlus } from "lucide-react";
import { EmptyState } from "@/components/desk/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface PendingClient {
  id: string;
  displayId: number;
  name: string;
  company: string | null;
  selfSourcedClaimedAt: string | null;
  createdByManager: { id: string; name: string } | null;
}

interface PendingUnassignedClient {
  id: string;
  displayId: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  createdAt: string;
}

// Single shared TariffSettings.usdtRateCny, not per-quote — see
// app/api/manager-tariffs/confirm-usdt-rate/route.ts.
interface PendingUsdtRateConfirmation {
  usdtRateCny: string;
  createdAt: string;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU");
}

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
}

// 2026-08-11: очередь и архив свелись к двум действующим типам ("чей
// клиент" и USDT-курс) — прибыль/премия больше не доверяют введённым вручную
// цифрам (выкуп факт, ручные ставки карго/¥/$/комиссии), а реальным деньгам
// в Кассе (см. lib/desk-services/quote-profit.ts, план
// mellow-forging-kay.md). "buyout"/"cargo_rate"/"cny_rate"/"usd_rate"/
// "buyout_commission" остаются в типе и архиве только как история уже
// принятых РАНЬШЕ решений — новые записи этих типов больше не появляются,
// но старые остаются доступны для аудита. Соответствующие confirm-*/route.ts
// роуты и /api/manager-confirmations-archive/revert не удалены — проще
// откатить, если что.
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

// Combined archive of every already-confirmed item — теперь в основном
// история (см. комментарий на ArchiveEntryType выше), но "Личный клиент"
// продолжает пополняться. Collapsed by default (closed <details>-style
// section) since it's a browse/audit tool, not something checked every
// visit the way the pending queue is. "Редактировать" and "Удалить" are
// the same underlying action here: revert the confirmation back to
// pending, where it can be corrected and re-confirmed through the exact
// same form that confirmed it originally (or just left there, which is
// effectively deletion) — no separate edit UI to build and keep in sync.
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
  const [pendingClients, setPendingClients] = useState<PendingClient[]>([]);
  // Owner-only (see /api/manager-confirmations) — empty for senior/manager
  // sessions without any extra gating needed here, since the API itself
  // never sends anything for them.
  const [pendingUnassignedClients, setPendingUnassignedClients] = useState<PendingUnassignedClient[]>([]);
  const [teamManagers, setTeamManagers] = useState<{ id: string; name: string }[]>([]);
  const [assigningClientId, setAssigningClientId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pendingUsdtRateConfirmation, setPendingUsdtRateConfirmation] = useState<PendingUsdtRateConfirmation | null>(null);
  const [busyUsdtRateConfirm, setBusyUsdtRateConfirm] = useState(false);
  const [usdtRateConfirmError, setUsdtRateConfirmError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    return fetch("/api/manager-confirmations")
      .then((res) => res.json())
      .then((data) => {
        setPendingClients(data.pendingClients ?? []);
        setPendingUnassignedClients(data.pendingUnassignedClients ?? []);
        setPendingUsdtRateConfirmation(data.pendingUsdtRateConfirmation ?? null);
        setTeamManagers(data.teamManagers ?? []);
      })
      .finally(() => setLoading(false));
  }

  async function handleConfirmUsdtRateConfirmation() {
    setBusyUsdtRateConfirm(true);
    setUsdtRateConfirmError(null);
    try {
      const res = await fetch("/api/manager-tariffs/confirm-usdt-rate", { method: "POST" });
      if (res.ok) {
        await load();
      } else {
        const data = await res.json();
        setUsdtRateConfirmError(data.error ?? "Не удалось подтвердить курс.");
      }
    } finally {
      setBusyUsdtRateConfirm(false);
    }
  }

  async function handleAssignClient(clientId: string, managerId: string) {
    if (!managerId) return;
    setAssigningClientId(clientId);
    setAssignError(null);
    try {
      // Reuses the same client-transfer PATCH clients-tab.tsx's "Передать
      // менеджеру" already calls — it sets createdByManagerId, reassigns
      // every quote of theirs, and hides contacts from the new manager by
      // default, exactly the same as a manual transfer.
      const res = await fetch(`/api/manager-clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transferToManagerId: managerId }),
      });
      if (res.ok) {
        await load();
      } else {
        const data = await res.json();
        setAssignError(data.error ?? "Не удалось назначить менеджера.");
      }
    } finally {
      setAssigningClientId(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

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

  const isEmpty = pendingClients.length === 0 && pendingUnassignedClients.length === 0 && !pendingUsdtRateConfirmation;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-bold text-text">Очередь подтверждений</h2>
        <p className="mt-1 text-xs text-text-secondary">
          Заявки на личных клиентов и курс USDT, которые ещё должен проверить и подтвердить старший менеджер или
          руководитель. Прибыль и премия по сделкам больше не зависят от этой очереди — они считаются по реальным
          деньгам в Кассе.
        </p>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      {isEmpty ? (
        <EmptyState icon={CheckCircle2} message="Очередь пуста — все заявки на личных клиентов подтверждены." />
      ) : (
        <>
          {pendingUnassignedClients.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                <UserPlus className="h-3.5 w-3.5" /> Новые клиенты без менеджера ({pendingUnassignedClients.length})
              </h3>
              <p className="mt-1 text-xs text-text-secondary">
                Зарегистрировались сами на сайте — пока их не видит ни один менеджер. Выберите, кому передать.
              </p>
              {assignError && <p className="mt-1 text-xs text-error">{assignError}</p>}
              <ul className="mt-2 space-y-2">
                {pendingUnassignedClients.map((client) => (
                  <li key={client.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
                    <div>
                      <span className="font-medium text-text">
                        №{client.displayId} · {client.name}
                        {client.company ? ` · ${client.company}` : ""}
                      </span>
                      <span className="ml-2 text-xs text-text-secondary">
                        {[client.email, client.phone].filter(Boolean).join(" · ") || "без контактов"} · зарегистрировался {formatDate(client.createdAt)}
                      </span>
                    </div>
                    <Select
                      value=""
                      onValueChange={(managerId) => handleAssignClient(client.id, managerId)}
                      disabled={assigningClientId === client.id}
                    >
                      <SelectTrigger className="h-8 w-52 text-xs">
                        {assigningClientId === client.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <SelectValue placeholder="Передать менеджеру" />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {teamManagers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pendingUsdtRateConfirmation && (
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                <Banknote className="h-3.5 w-3.5" /> Курс USDT для счетов на выкуп
              </h3>
              <p className="mt-1 text-xs text-text-secondary">
                Руководитель ввёл новый курс ¥→USDT (себестоимость по факту сделки) во вкладке «Тарифы» — пока он не
                подтверждён, менеджеры не могут выставлять клиентам счёт на выкуп в USDT.
              </p>
              {usdtRateConfirmError && <p className="mt-1 text-xs text-error">{usdtRateConfirmError}</p>}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
                <span className="font-medium text-text">
                  1 USDT = {Number(pendingUsdtRateConfirmation.usdtRateCny).toFixed(2)}¥
                </span>
                <button
                  type="button"
                  onClick={handleConfirmUsdtRateConfirmation}
                  disabled={busyUsdtRateConfirm}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
                >
                  {busyUsdtRateConfirm && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Подтвердить
                </button>
              </div>
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
