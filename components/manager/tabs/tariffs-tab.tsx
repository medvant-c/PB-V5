"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface TariffSettingsRecord {
  cnyRateRub: string;
  usdRateRub: string;
  volumeRateUsdPerCbm: string;
  standardPriceRub: string;
  expertPriceRub: string;
  proPriceRub: string;
  customProductionStandardRub: string;
  customProductionExpertRub: string;
  customProductionProRub: string;
  managerCargoRateUsdPerKg: string;
  managerCargoRateUsdPerM3: string;
  createdAt: string;
  // Present only for the owner — GET /api/manager-tariffs strips these two
  // for everyone else, so their presence here doubles as "am I the owner."
  cargoDensityMarginUsdPerKg?: string;
  cargoVolumeMarginUsdPerCbm?: string;
}

interface DensityTierRecord {
  id: string;
  categoryKey: string;
  categoryLabel: string;
  minDensity: string;
  maxDensity: string | null;
  ratePerKgUsd: string;
  // Present only for the owner — same stripping convention as
  // TariffSettings.cargoDensityMarginUsdPerKg above.
  costPerKgUsd?: string;
}

interface VolumeTariffRecord {
  id: string;
  categoryKey: string;
  categoryLabel: string;
  rateUsdPerCbm: string;
  // Present only for the owner — same stripping convention as above.
  costUsdPerCbm?: string;
}

interface BuyoutCommissionTariffRecord {
  id: string;
  minAmountRub: string;
  maxAmountRub: string | null;
  commissionPercent: string;
}

const FIELD_LABELS: Record<
  keyof Omit<TariffSettingsRecord, "createdAt" | "cargoDensityMarginUsdPerKg" | "cargoVolumeMarginUsdPerCbm">,
  string
> = {
  cnyRateRub: "Курс юаня (CNY → RUB)",
  usdRateRub: "Курс доллара (USD → RUB)",
  volumeRateUsdPerCbm: "Резервная ставка за м³ (если для категории нет своего тарифа), $",
  standardPriceRub: "Поиск товара Standart, ₽",
  expertPriceRub: "Поиск товара Expert, ₽",
  proPriceRub: "Поиск товара Pro, ₽",
  customProductionStandardRub: "Производство под заказ (Standart), ₽",
  customProductionExpertRub: "Производство под заказ (Expert), ₽",
  customProductionProRub: "Производство под заказ (Pro), ₽",
  managerCargoRateUsdPerKg: "Премия менеджеру за карго (свой клиент), $/кг",
  managerCargoRateUsdPerM3: "Премия менеджеру за карго (свой клиент), $/м³",
};

// Owner-only — never rendered for anyone else (see TariffSettingsRecord).
const OWNER_FIELD_LABELS: Record<"cargoDensityMarginUsdPerKg" | "cargoVolumeMarginUsdPerCbm", string> = {
  cargoDensityMarginUsdPerKg: "Стартовая маржа для новой категории (плотность), $/кг",
  cargoVolumeMarginUsdPerCbm: "Стартовая маржа для новой категории (объём), $/м³",
};

function ManagerTariffsTab() {
  const [settings, setSettings] = useState<TariffSettingsRecord | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tiers, setTiers] = useState<DensityTierRecord[]>([]);
  const [loadingTiers, setLoadingTiers] = useState(true);
  const [showNewTierForm, setShowNewTierForm] = useState(false);
  const [newTier, setNewTier] = useState({ categoryKey: "", categoryLabel: "", minDensity: "", maxDensity: "", ratePerKgUsd: "" });
  const [tierError, setTierError] = useState<string | null>(null);
  const [creatingTier, setCreatingTier] = useState(false);
  const [busyTierId, setBusyTierId] = useState<string | null>(null);
  const [tierRateDrafts, setTierRateDrafts] = useState<Record<string, string>>({});
  const [tierCostDrafts, setTierCostDrafts] = useState<Record<string, string>>({});

  const [volumeTariffs, setVolumeTariffs] = useState<VolumeTariffRecord[]>([]);
  const [loadingVolumeTariffs, setLoadingVolumeTariffs] = useState(true);
  const [showNewVolumeTariffForm, setShowNewVolumeTariffForm] = useState(false);
  const [newVolumeTariff, setNewVolumeTariff] = useState({ categoryKey: "", categoryLabel: "", rateUsdPerCbm: "" });
  const [volumeTariffError, setVolumeTariffError] = useState<string | null>(null);
  const [creatingVolumeTariff, setCreatingVolumeTariff] = useState(false);
  const [busyVolumeTariffId, setBusyVolumeTariffId] = useState<string | null>(null);
  const [volumeRateDrafts, setVolumeRateDrafts] = useState<Record<string, string>>({});
  const [volumeCostDrafts, setVolumeCostDrafts] = useState<Record<string, string>>({});

  const [buyoutCommissionTariffs, setBuyoutCommissionTariffs] = useState<BuyoutCommissionTariffRecord[]>([]);
  const [loadingBuyoutCommissionTariffs, setLoadingBuyoutCommissionTariffs] = useState(true);
  const [showNewBuyoutCommissionTariffForm, setShowNewBuyoutCommissionTariffForm] = useState(false);
  const [newBuyoutCommissionTariff, setNewBuyoutCommissionTariff] = useState({ minAmountRub: "", maxAmountRub: "", commissionPercent: "" });
  const [buyoutCommissionTariffError, setBuyoutCommissionTariffError] = useState<string | null>(null);
  const [creatingBuyoutCommissionTariff, setCreatingBuyoutCommissionTariff] = useState(false);
  const [busyBuyoutCommissionTariffId, setBusyBuyoutCommissionTariffId] = useState<string | null>(null);
  const [buyoutCommissionPercentDrafts, setBuyoutCommissionPercentDrafts] = useState<Record<string, string>>({});

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/manager-tariffs");
      const data = await res.json();
      if (res.ok) {
        setSettings(data.settings);
        setCanEdit(Boolean(data.canEdit));
        const isOwner = data.settings.cargoDensityMarginUsdPerKg !== undefined;
        const keys = isOwner
          ? [...Object.keys(FIELD_LABELS), ...Object.keys(OWNER_FIELD_LABELS)]
          : Object.keys(FIELD_LABELS);
        setForm(Object.fromEntries(keys.map((key) => [key, String(data.settings[key])])));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTiers = useCallback(async () => {
    setLoadingTiers(true);
    try {
      const res = await fetch("/api/manager-density-tariffs");
      const data = await res.json();
      if (res.ok) {
        setTiers(data.tiers);
        setTierRateDrafts(Object.fromEntries(data.tiers.map((t: DensityTierRecord) => [t.id, t.ratePerKgUsd])));
        setTierCostDrafts(
          Object.fromEntries(
            data.tiers.filter((t: DensityTierRecord) => t.costPerKgUsd !== undefined).map((t: DensityTierRecord) => [t.id, t.costPerKgUsd]),
          ),
        );
      }
    } finally {
      setLoadingTiers(false);
    }
  }, []);

  const loadVolumeTariffs = useCallback(async () => {
    setLoadingVolumeTariffs(true);
    try {
      const res = await fetch("/api/manager-volume-tariffs");
      const data = await res.json();
      if (res.ok) {
        setVolumeTariffs(data.tariffs);
        setVolumeRateDrafts(Object.fromEntries(data.tariffs.map((t: VolumeTariffRecord) => [t.id, t.rateUsdPerCbm])));
        setVolumeCostDrafts(
          Object.fromEntries(
            data.tariffs
              .filter((t: VolumeTariffRecord) => t.costUsdPerCbm !== undefined)
              .map((t: VolumeTariffRecord) => [t.id, t.costUsdPerCbm]),
          ),
        );
      }
    } finally {
      setLoadingVolumeTariffs(false);
    }
  }, []);

  const loadBuyoutCommissionTariffs = useCallback(async () => {
    setLoadingBuyoutCommissionTariffs(true);
    try {
      const res = await fetch("/api/manager-buyout-commission-tariffs");
      const data = await res.json();
      if (res.ok) {
        setBuyoutCommissionTariffs(data.tiers);
        setBuyoutCommissionPercentDrafts(
          Object.fromEntries(data.tiers.map((t: BuyoutCommissionTariffRecord) => [t.id, t.commissionPercent])),
        );
      }
    } finally {
      setLoadingBuyoutCommissionTariffs(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadTiers();
    loadVolumeTariffs();
    loadBuyoutCommissionTariffs();
  }, [loadSettings, loadTiers, loadVolumeTariffs, loadBuyoutCommissionTariffs]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/manager-tariffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось сохранить тарифы.");
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

  async function handleCreateTier() {
    if (creatingTier) return;
    setCreatingTier(true);
    setTierError(null);
    try {
      const res = await fetch("/api/manager-density-tariffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newTier, maxDensity: newTier.maxDensity || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTierError(data.error ?? "Не удалось добавить тариф.");
        return;
      }
      setNewTier({ categoryKey: "", categoryLabel: "", minDensity: "", maxDensity: "", ratePerKgUsd: "" });
      setShowNewTierForm(false);
      await loadTiers();
    } catch {
      setTierError("Не удалось связаться с сервером.");
    } finally {
      setCreatingTier(false);
    }
  }

  async function handleUpdateTierRate(tierId: string, currentRate: string) {
    const draft = tierRateDrafts[tierId];
    if (draft === undefined || draft === currentRate) return;
    const rate = Number(draft);
    if (!Number.isFinite(rate) || rate < 0) {
      setTierRateDrafts((current) => ({ ...current, [tierId]: currentRate }));
      return;
    }
    setBusyTierId(tierId);
    try {
      const res = await fetch(`/api/manager-density-tariffs/${tierId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratePerKgUsd: rate }),
      });
      if (res.ok) await loadTiers();
    } finally {
      setBusyTierId(null);
    }
  }

  async function handleUpdateTierCost(tierId: string, currentCost: string) {
    const draft = tierCostDrafts[tierId];
    if (draft === undefined || draft === currentCost) return;
    const cost = Number(draft);
    if (!Number.isFinite(cost) || cost < 0) {
      setTierCostDrafts((current) => ({ ...current, [tierId]: currentCost }));
      return;
    }
    setBusyTierId(tierId);
    try {
      const res = await fetch(`/api/manager-density-tariffs/${tierId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costPerKgUsd: cost }),
      });
      if (res.ok) await loadTiers();
    } finally {
      setBusyTierId(null);
    }
  }

  async function handleDeleteTier(tierId: string) {
    if (!window.confirm("Удалить этот тариф? Просчёты, уже посчитанные с этой ставкой, не изменятся.")) return;
    setBusyTierId(tierId);
    try {
      const res = await fetch(`/api/manager-density-tariffs/${tierId}`, { method: "DELETE" });
      if (res.ok) await loadTiers();
    } finally {
      setBusyTierId(null);
    }
  }

  async function handleCreateVolumeTariff() {
    if (creatingVolumeTariff) return;
    setCreatingVolumeTariff(true);
    setVolumeTariffError(null);
    try {
      const res = await fetch("/api/manager-volume-tariffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newVolumeTariff),
      });
      const data = await res.json();
      if (!res.ok) {
        setVolumeTariffError(data.error ?? "Не удалось добавить тариф.");
        return;
      }
      setNewVolumeTariff({ categoryKey: "", categoryLabel: "", rateUsdPerCbm: "" });
      setShowNewVolumeTariffForm(false);
      await loadVolumeTariffs();
    } catch {
      setVolumeTariffError("Не удалось связаться с сервером.");
    } finally {
      setCreatingVolumeTariff(false);
    }
  }

  async function handleUpdateVolumeRate(id: string, currentRate: string) {
    const draft = volumeRateDrafts[id];
    if (draft === undefined || draft === currentRate) return;
    const rate = Number(draft);
    if (!Number.isFinite(rate) || rate < 0) {
      setVolumeRateDrafts((current) => ({ ...current, [id]: currentRate }));
      return;
    }
    setBusyVolumeTariffId(id);
    try {
      const res = await fetch(`/api/manager-volume-tariffs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rateUsdPerCbm: rate }),
      });
      if (res.ok) await loadVolumeTariffs();
    } finally {
      setBusyVolumeTariffId(null);
    }
  }

  async function handleUpdateVolumeCost(id: string, currentCost: string) {
    const draft = volumeCostDrafts[id];
    if (draft === undefined || draft === currentCost) return;
    const cost = Number(draft);
    if (!Number.isFinite(cost) || cost < 0) {
      setVolumeCostDrafts((current) => ({ ...current, [id]: currentCost }));
      return;
    }
    setBusyVolumeTariffId(id);
    try {
      const res = await fetch(`/api/manager-volume-tariffs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costUsdPerCbm: cost }),
      });
      if (res.ok) await loadVolumeTariffs();
    } finally {
      setBusyVolumeTariffId(null);
    }
  }

  async function handleCreateBuyoutCommissionTariff() {
    if (creatingBuyoutCommissionTariff) return;
    setCreatingBuyoutCommissionTariff(true);
    setBuyoutCommissionTariffError(null);
    try {
      const res = await fetch("/api/manager-buyout-commission-tariffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newBuyoutCommissionTariff, maxAmountRub: newBuyoutCommissionTariff.maxAmountRub || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBuyoutCommissionTariffError(data.error ?? "Не удалось добавить тариф.");
        return;
      }
      setNewBuyoutCommissionTariff({ minAmountRub: "", maxAmountRub: "", commissionPercent: "" });
      setShowNewBuyoutCommissionTariffForm(false);
      await loadBuyoutCommissionTariffs();
    } catch {
      setBuyoutCommissionTariffError("Не удалось связаться с сервером.");
    } finally {
      setCreatingBuyoutCommissionTariff(false);
    }
  }

  async function handleUpdateBuyoutCommissionPercent(id: string, currentPercent: string) {
    const draft = buyoutCommissionPercentDrafts[id];
    if (draft === undefined || draft === currentPercent) return;
    const percent = Number(draft);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setBuyoutCommissionPercentDrafts((current) => ({ ...current, [id]: currentPercent }));
      return;
    }
    setBusyBuyoutCommissionTariffId(id);
    try {
      const res = await fetch(`/api/manager-buyout-commission-tariffs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionPercent: percent }),
      });
      if (res.ok) await loadBuyoutCommissionTariffs();
    } finally {
      setBusyBuyoutCommissionTariffId(null);
    }
  }

  async function handleDeleteBuyoutCommissionTariff(id: string) {
    if (!window.confirm("Удалить эту ступень комиссии? Просчёты, уже посчитанные с этой ставкой, не изменятся.")) return;
    setBusyBuyoutCommissionTariffId(id);
    try {
      const res = await fetch(`/api/manager-buyout-commission-tariffs/${id}`, { method: "DELETE" });
      if (res.ok) await loadBuyoutCommissionTariffs();
    } finally {
      setBusyBuyoutCommissionTariffId(null);
    }
  }

  const isOwner = settings?.cargoDensityMarginUsdPerKg !== undefined;

  const tiersByCategory = tiers.reduce<Record<string, DensityTierRecord[]>>((acc, tier) => {
    (acc[tier.categoryLabel] ??= []).push(tier);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-bold text-text">Тарифы</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Заполняйте каждое утро — курсы валют и ставки доставки. Просчёты, уже созданные с прежними цифрами,
          не меняются задним числом.
        </p>
        {settings && (
          <p className="mt-1 text-xs text-text-secondary">
            Обновлено: {new Date(settings.createdAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-text-secondary">Загрузка…</p>
      ) : (
        <form onSubmit={handleSave} className="grid gap-3 sm:grid-cols-2">
          {!canEdit && (
            <p className="sm:col-span-2 rounded-lg bg-bg px-3 py-2 text-xs text-text-secondary">
              Только руководитель или менеджер с правом изменения тарифов может их сохранять. Текущие значения
              видны ниже — они используются при расчёте просчётов.
            </p>
          )}
          {Object.entries(FIELD_LABELS).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`tariff-${key}`}>{label}</Label>
              <Input
                id={`tariff-${key}`}
                type="number"
                step="0.01"
                min={0}
                value={form[key] ?? ""}
                onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
                disabled={!canEdit}
                required
              />
            </div>
          ))}

          {isOwner && (
            <div className="space-y-3 rounded-xl border border-dashed border-border bg-bg p-3 sm:col-span-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                <Lock className="h-3.5 w-3.5" /> Ваша маржа по карго — видно только руководителю
              </div>
              <p className="text-xs text-text-secondary">
                Оба значения здесь — только стартовая маржа, которая подставляется при создании НОВОЙ категории (и
                вычисляет её себестоимость: ставка минус маржа). Для уже существующих категорий себестоимость
                редактируется отдельно, в таблицах ниже — у каждой категории она может быть своя, и по плотности, и
                по объёму.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(OWNER_FIELD_LABELS).map(([key, label]) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`tariff-${key}`}>{label}</Label>
                    <Input
                      id={`tariff-${key}`}
                      type="number"
                      step="0.01"
                      min={0}
                      value={form[key] ?? ""}
                      onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
                      required
                    />
                  </div>
                ))}
              </div>
              {Number(form.volumeRateUsdPerCbm) > 0 && Number(form.cargoVolumeMarginUsdPerCbm) >= 0 && (
                <p className="text-xs text-text-secondary">
                  Себестоимость резервной ставки: ${(Number(form.volumeRateUsdPerCbm) - Number(form.cargoVolumeMarginUsdPerCbm)).toFixed(2)}/м³
                </p>
              )}
            </div>
          )}

          {canEdit && (
            <div className="sm:col-span-2">
              {error && <p className="mb-2 text-xs text-error">{error}</p>}
              {saved && (
                <p className="mb-2 flex items-center gap-1 text-xs font-medium text-success">
                  <Check className="h-3.5 w-3.5" /> Сохранено.
                </p>
              )}
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить тарифы"}
              </Button>
            </div>
          )}
        </form>
      )}

      <div className="border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text">Доставка карго по плотности</h3>
          {canEdit && !showNewTierForm && (
            <Button type="button" size="sm" variant="outline" onClick={() => setShowNewTierForm(true)}>
              <Plus className="h-4 w-4" /> Добавить тариф
            </Button>
          )}
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          Категория товара → диапазон плотности (кг/м³) → ставка ($/кг). Используется, когда доставка считается
          «по плотности», а не «по объёму». При плотности ниже 100 кг/м³ доставка всегда считается по объёму
          (ставка «Ставка за м³» выше) — для любой категории, отдельный тариф здесь не нужен.
        </p>

        {showNewTierForm && (
          <div className="mt-3 space-y-2 rounded-xl border border-dashed border-border p-3">
            <div className="grid gap-2 sm:grid-cols-5">
              <Input
                placeholder="Ключ категории (clothing)"
                value={newTier.categoryKey}
                onChange={(e) => setNewTier((c) => ({ ...c, categoryKey: e.target.value }))}
              />
              <Input
                placeholder="Название (Одежда)"
                value={newTier.categoryLabel}
                onChange={(e) => setNewTier((c) => ({ ...c, categoryLabel: e.target.value }))}
              />
              <Input
                type="number"
                placeholder="От, кг/м³"
                value={newTier.minDensity}
                onChange={(e) => setNewTier((c) => ({ ...c, minDensity: e.target.value }))}
              />
              <Input
                type="number"
                placeholder="До, кг/м³ (необязательно)"
                value={newTier.maxDensity}
                onChange={(e) => setNewTier((c) => ({ ...c, maxDensity: e.target.value }))}
              />
              <Input
                type="number"
                step="0.01"
                placeholder="$/кг"
                value={newTier.ratePerKgUsd}
                onChange={(e) => setNewTier((c) => ({ ...c, ratePerKgUsd: e.target.value }))}
              />
            </div>
            {tierError && <p className="text-xs text-error">{tierError}</p>}
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={handleCreateTier} disabled={creatingTier}>
                {creatingTier ? <Loader2 className="h-4 w-4 animate-spin" /> : "Добавить"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewTierForm(false)}>
                Отмена
              </Button>
            </div>
          </div>
        )}

        {loadingTiers ? (
          <p className="mt-3 text-sm text-text-secondary">Загрузка…</p>
        ) : Object.keys(tiersByCategory).length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">Тарифов пока нет.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {Object.entries(tiersByCategory).map(([categoryLabel, categoryTiers]) => (
              <div key={categoryLabel}>
                <div className="text-xs font-semibold text-text-secondary">{categoryLabel}</div>
                <div className="mt-1.5 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-75 border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border bg-bg text-left text-xs text-text-secondary">
                        <th className="px-3 py-1.5 font-medium">Плотность, кг/м³</th>
                        <th className="px-3 py-1.5 font-medium">Ставка, $/кг</th>
                        {isOwner && <th className="px-3 py-1.5 font-medium">Себестоимость, $/кг</th>}
                        {canEdit && <th className="px-3 py-1.5 font-medium" />}
                      </tr>
                    </thead>
                    <tbody>
                      {categoryTiers.map((tier) => (
                        <tr key={tier.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-1.5 text-text-secondary">
                            {tier.minDensity}–{tier.maxDensity ?? "∞"}
                          </td>
                          <td className="px-3 py-1.5 font-medium text-text">
                            {canEdit ? (
                              <div className="flex items-center gap-1">
                                $
                                <Input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  className="h-7 w-20 px-1.5 text-sm"
                                  value={tierRateDrafts[tier.id] ?? tier.ratePerKgUsd}
                                  onChange={(e) => setTierRateDrafts((c) => ({ ...c, [tier.id]: e.target.value }))}
                                  onBlur={() => handleUpdateTierRate(tier.id, tier.ratePerKgUsd)}
                                  disabled={busyTierId === tier.id}
                                />
                              </div>
                            ) : (
                              `$${tier.ratePerKgUsd}`
                            )}
                          </td>
                          {isOwner && (
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1">
                                $
                                <Input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  className="h-7 w-20 px-1.5 text-sm"
                                  value={tierCostDrafts[tier.id] ?? tier.costPerKgUsd ?? "0"}
                                  onChange={(e) => setTierCostDrafts((c) => ({ ...c, [tier.id]: e.target.value }))}
                                  onBlur={() => handleUpdateTierCost(tier.id, tier.costPerKgUsd ?? "0")}
                                  disabled={busyTierId === tier.id}
                                />
                              </div>
                            </td>
                          )}
                          {canEdit && (
                            <td className="px-3 py-1.5 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteTier(tier.id)}
                                disabled={busyTierId === tier.id}
                                className="text-text-secondary transition-colors hover:text-error disabled:opacity-50"
                                aria-label="Удалить тариф"
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
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text">Доставка карго по объёму</h3>
          {canEdit && !showNewVolumeTariffForm && (
            <Button type="button" size="sm" variant="outline" onClick={() => setShowNewVolumeTariffForm(true)}>
              <Plus className="h-4 w-4" /> Добавить категорию
            </Button>
          )}
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          Категория товара → ставка ($/м³). Используется, когда доставка считается «по объёму» — либо потому что
          менеджер выбрал этот режим, либо потому что плотность ниже 100 кг/м³ (тогда категория берётся та же, что
          выбрана для расчёта по плотности).
        </p>

        {showNewVolumeTariffForm && (
          <div className="mt-3 space-y-2 rounded-xl border border-dashed border-border p-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                placeholder="Ключ категории (clothing)"
                value={newVolumeTariff.categoryKey}
                onChange={(e) => setNewVolumeTariff((c) => ({ ...c, categoryKey: e.target.value }))}
              />
              <Input
                placeholder="Название (Одежда)"
                value={newVolumeTariff.categoryLabel}
                onChange={(e) => setNewVolumeTariff((c) => ({ ...c, categoryLabel: e.target.value }))}
              />
              <Input
                type="number"
                step="0.01"
                placeholder="$/м³"
                value={newVolumeTariff.rateUsdPerCbm}
                onChange={(e) => setNewVolumeTariff((c) => ({ ...c, rateUsdPerCbm: e.target.value }))}
              />
            </div>
            {volumeTariffError && <p className="text-xs text-error">{volumeTariffError}</p>}
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={handleCreateVolumeTariff} disabled={creatingVolumeTariff}>
                {creatingVolumeTariff ? <Loader2 className="h-4 w-4 animate-spin" /> : "Добавить"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewVolumeTariffForm(false)}>
                Отмена
              </Button>
            </div>
          </div>
        )}

        {loadingVolumeTariffs ? (
          <p className="mt-3 text-sm text-text-secondary">Загрузка…</p>
        ) : volumeTariffs.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">Тарифов пока нет.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-75 border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-bg text-left text-xs text-text-secondary">
                  <th className="px-3 py-1.5 font-medium">Категория</th>
                  <th className="px-3 py-1.5 font-medium">Ставка, $/м³</th>
                  {isOwner && <th className="px-3 py-1.5 font-medium">Себестоимость, $/м³</th>}
                </tr>
              </thead>
              <tbody>
                {volumeTariffs.map((tariff) => (
                  <tr key={tariff.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5 text-text">{tariff.categoryLabel}</td>
                    <td className="px-3 py-1.5 font-medium text-text">
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          $
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            className="h-7 w-20 px-1.5 text-sm"
                            value={volumeRateDrafts[tariff.id] ?? tariff.rateUsdPerCbm}
                            onChange={(e) => setVolumeRateDrafts((c) => ({ ...c, [tariff.id]: e.target.value }))}
                            onBlur={() => handleUpdateVolumeRate(tariff.id, tariff.rateUsdPerCbm)}
                            disabled={busyVolumeTariffId === tariff.id}
                          />
                        </div>
                      ) : (
                        `$${tariff.rateUsdPerCbm}`
                      )}
                    </td>
                    {isOwner && (
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          $
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            className="h-7 w-20 px-1.5 text-sm"
                            value={volumeCostDrafts[tariff.id] ?? tariff.costUsdPerCbm ?? "0"}
                            onChange={(e) => setVolumeCostDrafts((c) => ({ ...c, [tariff.id]: e.target.value }))}
                            onBlur={() => handleUpdateVolumeCost(tariff.id, tariff.costUsdPerCbm ?? "0")}
                            disabled={busyVolumeTariffId === tariff.id}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text">Комиссия за организацию выкупа</h3>
          {canEdit && !showNewBuyoutCommissionTariffForm && (
            <Button type="button" size="sm" variant="outline" onClick={() => setShowNewBuyoutCommissionTariffForm(true)}>
              <Plus className="h-4 w-4" /> Добавить ступень
            </Button>
          )}
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          Сумма закупа (стоимость товара, без доставки по Китаю) → комиссия за организацию выкупа, %. Чем больше
          заказ, тем ниже комиссия. Ступени не должны пересекаться — верхняя граница не входит в саму ступень
          (например, «0–499 999,99» и следующая ступень «от 500 000»).
        </p>

        {showNewBuyoutCommissionTariffForm && (
          <div className="mt-3 space-y-2 rounded-xl border border-dashed border-border p-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                type="number"
                placeholder="От, ₽"
                value={newBuyoutCommissionTariff.minAmountRub}
                onChange={(e) => setNewBuyoutCommissionTariff((c) => ({ ...c, minAmountRub: e.target.value }))}
              />
              <Input
                type="number"
                placeholder="До, ₽ (необязательно)"
                value={newBuyoutCommissionTariff.maxAmountRub}
                onChange={(e) => setNewBuyoutCommissionTariff((c) => ({ ...c, maxAmountRub: e.target.value }))}
              />
              <Input
                type="number"
                step="0.01"
                placeholder="Комиссия, %"
                value={newBuyoutCommissionTariff.commissionPercent}
                onChange={(e) => setNewBuyoutCommissionTariff((c) => ({ ...c, commissionPercent: e.target.value }))}
              />
            </div>
            {buyoutCommissionTariffError && <p className="text-xs text-error">{buyoutCommissionTariffError}</p>}
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={handleCreateBuyoutCommissionTariff} disabled={creatingBuyoutCommissionTariff}>
                {creatingBuyoutCommissionTariff ? <Loader2 className="h-4 w-4 animate-spin" /> : "Добавить"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewBuyoutCommissionTariffForm(false)}>
                Отмена
              </Button>
            </div>
          </div>
        )}

        {loadingBuyoutCommissionTariffs ? (
          <p className="mt-3 text-sm text-text-secondary">Загрузка…</p>
        ) : buyoutCommissionTariffs.length === 0 ? (
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
                {buyoutCommissionTariffs.map((tier) => (
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
                            value={buyoutCommissionPercentDrafts[tier.id] ?? tier.commissionPercent}
                            onChange={(e) => setBuyoutCommissionPercentDrafts((c) => ({ ...c, [tier.id]: e.target.value }))}
                            onBlur={() => handleUpdateBuyoutCommissionPercent(tier.id, tier.commissionPercent)}
                            disabled={busyBuyoutCommissionTariffId === tier.id}
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
                          onClick={() => handleDeleteBuyoutCommissionTariff(tier.id)}
                          disabled={busyBuyoutCommissionTariffId === tier.id}
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

export { ManagerTariffsTab };
