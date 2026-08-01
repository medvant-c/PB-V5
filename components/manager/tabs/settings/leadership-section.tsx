"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ShareType = "percent_of_profit" | "flat_per_cargo_kg" | "remainder_share";

interface InvestorRecord {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
  shareType: ShareType;
  ratePercent: string | null;
  rateUsdPerKg: string | null;
  paymentChannel: string | null;
  note: string | null;
}

const SHARE_TYPE_LABEL: Record<ShareType, string> = {
  percent_of_profit: "% от прибыли (со всех источников)",
  flat_per_cargo_kg: "Фикс $/кг с доставленного карго",
  remainder_share: "Остаток поровну",
};

const BLANK_FORM = { name: "", shareType: "percent_of_profit" as ShareType, ratePercent: "", rateUsdPerKg: "", paymentChannel: "", note: "" };

// «Руководящий состав» — список инвесторов/партнёров с долей в прибыли.
// Раньше Влад/Юра/Александр/Антон были зашиты в код (имена, ставки, и
// формула "остаток пополам"); теперь это данные — количество, имена,
// ставки и канал выплаты можно менять здесь, без правки кода. См.
// Investor в prisma/schema.prisma. Владелец-only.
function ManagerLeadershipTab() {
  const [investors, setInvestors] = useState<InvestorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const [showNewForm, setShowNewForm] = useState(false);
  const [newInvestor, setNewInvestor] = useState(BLANK_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [drafts, setDrafts] = useState<Record<string, { name: string; ratePercent: string; rateUsdPerKg: string; paymentChannel: string; note: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/manager-investors");
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setInvestors(data.investors ?? []);
        setDrafts(
          Object.fromEntries(
            (data.investors ?? []).map((inv: InvestorRecord) => [
              inv.id,
              {
                name: inv.name,
                ratePercent: inv.ratePercent ?? "",
                rateUsdPerKg: inv.rateUsdPerKg ?? "",
                paymentChannel: inv.paymentChannel ?? "",
                note: inv.note ?? "",
              },
            ]),
          ),
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    if (creating || !newInvestor.name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/manager-investors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newInvestor),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error ?? "Не удалось добавить.");
        return;
      }
      setNewInvestor(BLANK_FORM);
      setShowNewForm(false);
      await load();
    } catch {
      setCreateError("Не удалось связаться с сервером.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveRow(inv: InvestorRecord) {
    const draft = drafts[inv.id];
    if (!draft) return;
    setBusyId(inv.id);
    setRowError(null);
    try {
      const body: Record<string, unknown> = { name: draft.name, paymentChannel: draft.paymentChannel, note: draft.note };
      if (inv.shareType === "percent_of_profit") body.ratePercent = draft.ratePercent;
      if (inv.shareType === "flat_per_cargo_kg") body.rateUsdPerKg = draft.rateUsdPerKg;
      const res = await fetch(`/api/manager-investors/${inv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setRowError(data.error ?? "Не удалось сохранить.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleActive(inv: InvestorRecord) {
    setBusyId(inv.id);
    try {
      const res = await fetch(`/api/manager-investors/${inv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !inv.active }),
      });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(inv: InvestorRecord) {
    if (!window.confirm(`Удалить «${inv.name}» насовсем? Если он просто больше не участвует — лучше выключить, не удалять.`)) return;
    setBusyId(inv.id);
    try {
      const res = await fetch(`/api/manager-investors/${inv.id}`, { method: "DELETE" });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  if (forbidden) {
    return <p className="text-sm text-text-secondary">Доступно только руководителю.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-text">Руководящий состав</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Инвесторы и партнёры с долей в прибыли компании — видно только руководителю. Количество, имена, ставки
            и куда идёт выплата можно менять здесь в любой момент.
          </p>
        </div>
        {!showNewForm && (
          <Button type="button" size="sm" variant="outline" onClick={() => setShowNewForm(true)}>
            <Plus className="h-4 w-4" /> Добавить
          </Button>
        )}
      </div>

      {showNewForm && (
        <div className="space-y-3 rounded-xl border border-dashed border-border p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Имя" value={newInvestor.name} onChange={(e) => setNewInvestor((c) => ({ ...c, name: e.target.value }))} />
            <Select value={newInvestor.shareType} onValueChange={(v) => setNewInvestor((c) => ({ ...c, shareType: v as ShareType }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SHARE_TYPE_LABEL) as ShareType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {SHARE_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {newInvestor.shareType === "percent_of_profit" && (
              <Input
                type="number"
                step="0.01"
                min={0}
                max={100}
                placeholder="Доля, %"
                value={newInvestor.ratePercent}
                onChange={(e) => setNewInvestor((c) => ({ ...c, ratePercent: e.target.value }))}
              />
            )}
            {newInvestor.shareType === "flat_per_cargo_kg" && (
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="Ставка, $/кг"
                value={newInvestor.rateUsdPerKg}
                onChange={(e) => setNewInvestor((c) => ({ ...c, rateUsdPerKg: e.target.value }))}
              />
            )}
            <Input
              placeholder="Канал выплаты (необязательно)"
              value={newInvestor.paymentChannel}
              onChange={(e) => setNewInvestor((c) => ({ ...c, paymentChannel: e.target.value }))}
            />
          </div>
          {createError && <p className="text-xs text-error">{createError}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Добавить"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewForm(false)}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      {rowError && <p className="text-xs text-error">{rowError}</p>}

      {loading ? (
        <p className="text-sm text-text-secondary">Загрузка…</p>
      ) : investors.length === 0 ? (
        <p className="text-sm text-text-secondary">Пока никого нет.</p>
      ) : (
        <div className="space-y-3">
          {investors.map((inv) => {
            const draft = drafts[inv.id] ?? { name: inv.name, ratePercent: "", rateUsdPerKg: "", paymentChannel: "", note: "" };
            return (
              <div key={inv.id} className={`rounded-xl border border-border p-3 ${inv.active ? "" : "opacity-50"}`}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Имя</Label>
                    <Input
                      value={draft.name}
                      onChange={(e) => setDrafts((c) => ({ ...c, [inv.id]: { ...draft, name: e.target.value } }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Тип доли</Label>
                    <Input value={SHARE_TYPE_LABEL[inv.shareType]} disabled />
                  </div>
                  {inv.shareType === "percent_of_profit" && (
                    <div className="space-y-1.5">
                      <Label>Доля, %</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        max={100}
                        value={draft.ratePercent}
                        onChange={(e) => setDrafts((c) => ({ ...c, [inv.id]: { ...draft, ratePercent: e.target.value } }))}
                      />
                    </div>
                  )}
                  {inv.shareType === "flat_per_cargo_kg" && (
                    <div className="space-y-1.5">
                      <Label>Ставка, $/кг</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={draft.rateUsdPerKg}
                        onChange={(e) => setDrafts((c) => ({ ...c, [inv.id]: { ...draft, rateUsdPerKg: e.target.value } }))}
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label>Канал выплаты</Label>
                    <Input
                      placeholder="—"
                      value={draft.paymentChannel}
                      onChange={(e) => setDrafts((c) => ({ ...c, [inv.id]: { ...draft, paymentChannel: e.target.value } }))}
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" onClick={() => handleSaveRow(inv)} disabled={busyId === inv.id}>
                    {busyId === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => handleToggleActive(inv)} disabled={busyId === inv.id}>
                    {inv.active ? "Выключить" : "Включить"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => handleDelete(inv)}
                    disabled={busyId === inv.id}
                    className="ml-auto text-text-secondary transition-colors hover:text-error disabled:opacity-50"
                    aria-label="Удалить"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { ManagerLeadershipTab };
