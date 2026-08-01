"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface SystemSettingsRecord {
  normalRatePercent: string;
  selfSourcedProscetRatePercent: string;
  selfSourcedBuyoutDiscountRatePercent: string;
  freeStandardQuoteLimit: number;
  updatedAt: string;
}

interface BuyoutCommissionTariffRecord {
  id: string;
  minAmountRub: string;
  maxAmountRub: string | null;
  commissionPercent: string;
}

const PERCENT_FIELD_LABELS: Record<"normalRatePercent" | "selfSourcedProscetRatePercent" | "selfSourcedBuyoutDiscountRatePercent", { label: string; hint: string }> = {
  normalRatePercent: {
    label: "Обычный клиент (лид компании), %",
    hint: "Ставка премии менеджеру с Просчёта, Выкупа и Скидки поставщика для клиента, которого не заявили как личного.",
  },
  selfSourcedProscetRatePercent: {
    label: "Личный клиент — Просчёт, %",
    hint: "Ставка премии с Просчёта для подтверждённого личного клиента менеджера.",
  },
  selfSourcedBuyoutDiscountRatePercent: {
    label: "Личный клиент — Выкуп и Скидка, %",
    hint: "Ставка премии с Выкупа и Скидки поставщика для подтверждённого личного клиента.",
  },
};

// «Просчёты и выкуп» — ставки премии менеджеру за эти два источника плюс
// комиссия за организацию выкупа (лестница по сумме закупа) и лимит
// бесплатных просчётов Standart.
function ManagerQuotesBuyoutSettingsTab() {
  const [settings, setSettings] = useState<SystemSettingsRecord | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tariffs, setTariffs] = useState<BuyoutCommissionTariffRecord[]>([]);
  const [loadingTariffs, setLoadingTariffs] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTariff, setNewTariff] = useState({ minAmountRub: "", maxAmountRub: "", commissionPercent: "" });
  const [tariffError, setTariffError] = useState<string | null>(null);
  const [creatingTariff, setCreatingTariff] = useState(false);
  const [busyTariffId, setBusyTariffId] = useState<string | null>(null);
  const [percentDrafts, setPercentDrafts] = useState<Record<string, string>>({});

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/manager-settings");
      const data = await res.json();
      if (res.ok) {
        setSettings(data.settings);
        setCanEdit(Boolean(data.canEdit));
        setForm({
          normalRatePercent: data.settings.normalRatePercent,
          selfSourcedProscetRatePercent: data.settings.selfSourcedProscetRatePercent,
          selfSourcedBuyoutDiscountRatePercent: data.settings.selfSourcedBuyoutDiscountRatePercent,
          freeStandardQuoteLimit: String(data.settings.freeStandardQuoteLimit),
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTariffs = useCallback(async () => {
    setLoadingTariffs(true);
    try {
      const res = await fetch("/api/manager-buyout-commission-tariffs");
      const data = await res.json();
      if (res.ok) {
        setTariffs(data.tiers);
        setPercentDrafts(Object.fromEntries(data.tiers.map((t: BuyoutCommissionTariffRecord) => [t.id, t.commissionPercent])));
      }
    } finally {
      setLoadingTariffs(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadTariffs();
  }, [loadSettings, loadTariffs]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/manager-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось сохранить.");
        return;
      }
      setSaved(true);
      await loadSettings();
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateTariff() {
    if (creatingTariff) return;
    setCreatingTariff(true);
    setTariffError(null);
    try {
      const res = await fetch("/api/manager-buyout-commission-tariffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newTariff, maxAmountRub: newTariff.maxAmountRub || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTariffError(data.error ?? "Не удалось добавить ступень.");
        return;
      }
      setNewTariff({ minAmountRub: "", maxAmountRub: "", commissionPercent: "" });
      setShowNewForm(false);
      await loadTariffs();
    } catch {
      setTariffError("Не удалось связаться с сервером.");
    } finally {
      setCreatingTariff(false);
    }
  }

  async function handleUpdatePercent(id: string, currentPercent: string) {
    const draft = percentDrafts[id];
    if (draft === undefined || draft === currentPercent) return;
    const percent = Number(draft);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setPercentDrafts((c) => ({ ...c, [id]: currentPercent }));
      return;
    }
    setBusyTariffId(id);
    try {
      const res = await fetch(`/api/manager-buyout-commission-tariffs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionPercent: percent }),
      });
      if (res.ok) await loadTariffs();
    } finally {
      setBusyTariffId(null);
    }
  }

  async function handleDeleteTariff(id: string) {
    if (!window.confirm("Удалить эту ступень комиссии? Просчёты, уже посчитанные с этой ставкой, не изменятся.")) return;
    setBusyTariffId(id);
    try {
      const res = await fetch(`/api/manager-buyout-commission-tariffs/${id}`, { method: "DELETE" });
      if (res.ok) await loadTariffs();
    } finally {
      setBusyTariffId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-bold text-text">Просчёты и выкуп</h2>
        {settings && (
          <p className="mt-1 text-xs text-text-secondary">
            Обновлено: {new Date(settings.updatedAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-text-secondary">Загрузка…</p>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {!canEdit && (
            <p className="rounded-lg bg-bg px-3 py-2 text-xs text-text-secondary">
              Изменять может только руководитель. Текущие значения видны ниже.
            </p>
          )}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-text">Ставки премии менеджеру</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(PERCENT_FIELD_LABELS).map(([key, { label, hint }]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`qb-${key}`}>{label}</Label>
                  <Input
                    id={`qb-${key}`}
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    value={form[key] ?? ""}
                    onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
                    disabled={!canEdit}
                    required
                  />
                  <p className="text-xs text-text-secondary">{hint}</p>
                </div>
              ))}
              <div className="space-y-1.5">
                <Label htmlFor="qb-freeStandardQuoteLimit">Бесплатных просчётов Standart на клиента, шт</Label>
                <Input
                  id="qb-freeStandardQuoteLimit"
                  type="number"
                  step="1"
                  min={0}
                  value={form.freeStandardQuoteLimit ?? ""}
                  onChange={(e) => setForm((current) => ({ ...current, freeStandardQuoteLimit: e.target.value }))}
                  disabled={!canEdit}
                  required
                />
                <p className="text-xs text-text-secondary">Действует только для новых просчётов — уже созданные не пересчитываются.</p>
              </div>
            </div>
          </div>

          {canEdit && (
            <div>
              {error && <p className="mb-2 text-xs text-error">{error}</p>}
              {saved && (
                <p className="mb-2 flex items-center gap-1 text-xs font-medium text-success">
                  <Check className="h-3.5 w-3.5" /> Сохранено.
                </p>
              )}
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
              </Button>
            </div>
          )}
        </form>
      )}

      <div className="border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text">Комиссия за организацию выкупа</h3>
          {canEdit && !showNewForm && (
            <Button type="button" size="sm" variant="outline" onClick={() => setShowNewForm(true)}>
              <Plus className="h-4 w-4" /> Добавить ступень
            </Button>
          )}
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          Сумма закупа (стоимость товара, без доставки по Китаю) → комиссия за организацию выкупа, %. Чем больше
          заказ, тем ниже комиссия. Ступени не должны пересекаться — верхняя граница не входит в саму ступень
          (например, «0–499 999,99» и следующая ступень «от 500 000»).
        </p>

        {showNewForm && (
          <div className="mt-3 space-y-2 rounded-xl border border-dashed border-border p-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                type="number"
                placeholder="От, ₽"
                value={newTariff.minAmountRub}
                onChange={(e) => setNewTariff((c) => ({ ...c, minAmountRub: e.target.value }))}
              />
              <Input
                type="number"
                placeholder="До, ₽ (необязательно)"
                value={newTariff.maxAmountRub}
                onChange={(e) => setNewTariff((c) => ({ ...c, maxAmountRub: e.target.value }))}
              />
              <Input
                type="number"
                step="0.01"
                placeholder="Комиссия, %"
                value={newTariff.commissionPercent}
                onChange={(e) => setNewTariff((c) => ({ ...c, commissionPercent: e.target.value }))}
              />
            </div>
            {tariffError && <p className="text-xs text-error">{tariffError}</p>}
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={handleCreateTariff} disabled={creatingTariff}>
                {creatingTariff ? <Loader2 className="h-4 w-4 animate-spin" /> : "Добавить"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewForm(false)}>
                Отмена
              </Button>
            </div>
          </div>
        )}

        {loadingTariffs ? (
          <p className="mt-3 text-sm text-text-secondary">Загрузка…</p>
        ) : tariffs.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">Ступеней пока нет.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-75 border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-bg text-left text-xs text-text-secondary">
                  <th className="px-3 py-1.5 font-medium">Сумма закупа, ₽</th>
                  <th className="px-3 py-1.5 font-medium">Комиссия, %</th>
                  {canEdit && <th className="px-3 py-1.5 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {tariffs.map((tier) => (
                  <tr key={tier.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5 text-text-secondary">
                      {Number(tier.minAmountRub).toLocaleString("ru-RU")}–{tier.maxAmountRub ? Number(tier.maxAmountRub).toLocaleString("ru-RU") : "∞"}
                    </td>
                    <td className="px-3 py-1.5 font-medium text-text">
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            max={100}
                            className="h-7 w-20 px-1.5 text-sm"
                            value={percentDrafts[tier.id] ?? tier.commissionPercent}
                            onChange={(e) => setPercentDrafts((c) => ({ ...c, [tier.id]: e.target.value }))}
                            onBlur={() => handleUpdatePercent(tier.id, tier.commissionPercent)}
                            disabled={busyTariffId === tier.id}
                          />
                          %
                        </div>
                      ) : (
                        `${tier.commissionPercent}%`
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-3 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteTariff(tier.id)}
                          disabled={busyTariffId === tier.id}
                          className="text-text-secondary transition-colors hover:text-error disabled:opacity-50"
                          aria-label="Удалить ступень"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export { ManagerQuotesBuyoutSettingsTab };
