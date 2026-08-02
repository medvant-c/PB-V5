"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DESTINATION_COUNTRIES, type DestinationCountry } from "@/lib/destination-countries";

interface TariffCargoFields {
  volumeRateUsdPerCbm: string;
  managerCargoRateUsdPerKg: string;
  managerCargoRateUsdPerM3: string;
  createdAt: string;
  // Present only for the owner — same stripping convention as elsewhere in
  // «Настройки».
  cargoDensityMarginUsdPerKg?: string;
  cargoVolumeMarginUsdPerCbm?: string;
}

interface SystemCargoFields {
  lowDensityVolumeThresholdKgM3: string;
}

interface DensityTierRecord {
  id: string;
  categoryKey: string;
  categoryLabel: string;
  minDensity: string;
  maxDensity: string | null;
  ratePerKgUsd: string;
  costPerKgUsd?: string;
}

interface VolumeTariffRecord {
  id: string;
  categoryKey: string;
  categoryLabel: string;
  rateUsdPerCbm: string;
  costUsdPerCbm?: string;
}

const CARGO_FIELD_LABELS: Record<"volumeRateUsdPerCbm" | "managerCargoRateUsdPerKg" | "managerCargoRateUsdPerM3", string> = {
  volumeRateUsdPerCbm: "Резервная ставка за м³ (если для категории нет своего тарифа), $",
  managerCargoRateUsdPerKg: "Премия менеджеру за карго (свой клиент), $/кг",
  managerCargoRateUsdPerM3: "Премия менеджеру за карго (свой клиент), $/м³",
};

const OWNER_MARGIN_FIELD_LABELS: Record<"cargoDensityMarginUsdPerKg" | "cargoVolumeMarginUsdPerCbm", string> = {
  cargoDensityMarginUsdPerKg: "Стартовая маржа для новой категории (плотность), $/кг",
  cargoVolumeMarginUsdPerCbm: "Стартовая маржа для новой категории (объём), $/м³",
};

// Карго sub-tab of «Настройки» — всё, что касается карго-доставки, в одном
// месте: тарифы по плотности/объёму, резервная ставка, премия менеджеру,
// ваша маржа, порог «считать по объёму». Раньше было разбросано между
// вкладками «Тарифы» и «Настройки». See PB-V5 chat 2026-07-31.
function ManagerCargoSettingsTab() {
  const [tariffForm, setTariffForm] = useState<Record<string, string>>({});
  const [isOwner, setIsOwner] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [loadingTariffs, setLoadingTariffs] = useState(true);
  const [savingTariffs, setSavingTariffs] = useState(false);
  const [savedTariffs, setSavedTariffs] = useState(false);
  const [tariffError, setTariffError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [thresholdForm, setThresholdForm] = useState("");
  const [loadingThreshold, setLoadingThreshold] = useState(true);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [savedThreshold, setSavedThreshold] = useState(false);
  const [thresholdError, setThresholdError] = useState<string | null>(null);

  // Density/volume tariffs are scoped per destination country — both
  // tables below reload whenever this changes. See PB-V5 chat 2026-08-02.
  const [selectedCountry, setSelectedCountry] = useState<DestinationCountry>("russia");

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

  const loadTariffs = useCallback(async () => {
    setLoadingTariffs(true);
    try {
      const res = await fetch("/api/manager-tariffs");
      const data = await res.json();
      if (res.ok) {
        const settings: TariffCargoFields = data.settings;
        const settingsRecord = data.settings as Record<string, unknown>;
        setCanEdit(Boolean(data.canEdit));
        const owner = settings.cargoDensityMarginUsdPerKg !== undefined;
        setIsOwner(owner);
        setUpdatedAt(settings.createdAt);
        const keys = owner
          ? [...Object.keys(CARGO_FIELD_LABELS), ...Object.keys(OWNER_MARGIN_FIELD_LABELS)]
          : Object.keys(CARGO_FIELD_LABELS);
        setTariffForm(Object.fromEntries(keys.map((key) => [key, String(settingsRecord[key])])));
      }
    } finally {
      setLoadingTariffs(false);
    }
  }, []);

  const loadThreshold = useCallback(async () => {
    setLoadingThreshold(true);
    try {
      const res = await fetch("/api/manager-settings");
      const data = await res.json();
      if (res.ok) {
        const settings: SystemCargoFields = data.settings;
        setThresholdForm(settings.lowDensityVolumeThresholdKgM3);
      }
    } finally {
      setLoadingThreshold(false);
    }
  }, []);

  const loadTiers = useCallback(async () => {
    setLoadingTiers(true);
    try {
      const res = await fetch(`/api/manager-density-tariffs?country=${selectedCountry}`);
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
  }, [selectedCountry]);

  const loadVolumeTariffs = useCallback(async () => {
    setLoadingVolumeTariffs(true);
    try {
      const res = await fetch(`/api/manager-volume-tariffs?country=${selectedCountry}`);
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
  }, [selectedCountry]);

  useEffect(() => {
    loadTariffs();
    loadThreshold();
    loadTiers();
    loadVolumeTariffs();
  }, [loadTariffs, loadThreshold, loadTiers, loadVolumeTariffs]);

  async function handleSaveTariffs(event: React.FormEvent) {
    event.preventDefault();
    if (savingTariffs) return;
    setSavingTariffs(true);
    setTariffError(null);
    setSavedTariffs(false);
    try {
      const res = await fetch("/api/manager-tariffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tariffForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setTariffError(data.error ?? "Не удалось сохранить.");
        return;
      }
      setSavedTariffs(true);
      await loadTariffs();
    } catch {
      setTariffError("Не удалось связаться с сервером.");
    } finally {
      setSavingTariffs(false);
    }
  }

  async function handleSaveThreshold(event: React.FormEvent) {
    event.preventDefault();
    if (savingThreshold) return;
    setSavingThreshold(true);
    setThresholdError(null);
    setSavedThreshold(false);
    try {
      const res = await fetch("/api/manager-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lowDensityVolumeThresholdKgM3: thresholdForm }),
      });
      const data = await res.json();
      if (!res.ok) {
        setThresholdError(data.error ?? "Не удалось сохранить.");
        return;
      }
      setSavedThreshold(true);
      await loadThreshold();
    } catch {
      setThresholdError("Не удалось связаться с сервером.");
    } finally {
      setSavingThreshold(false);
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
        body: JSON.stringify({ ...newTier, maxDensity: newTier.maxDensity || null, destinationCountry: selectedCountry }),
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
        body: JSON.stringify({ ...newVolumeTariff, destinationCountry: selectedCountry }),
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

  const tiersByCategory = tiers.reduce<Record<string, DensityTierRecord[]>>((acc, tier) => {
    (acc[tier.categoryLabel] ??= []).push(tier);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-bold text-text">Карго</h2>
        {updatedAt && (
          <p className="mt-1 text-xs text-text-secondary">
            Обновлено: {new Date(updatedAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
          </p>
        )}
      </div>

      {loadingTariffs ? (
        <p className="text-sm text-text-secondary">Загрузка…</p>
      ) : (
        <form onSubmit={handleSaveTariffs} className="grid gap-3 sm:grid-cols-2">
          {Object.entries(CARGO_FIELD_LABELS).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`cargo-${key}`}>{label}</Label>
              <Input
                id={`cargo-${key}`}
                type="number"
                step="0.01"
                min={0}
                value={tariffForm[key] ?? ""}
                onChange={(e) => setTariffForm((current) => ({ ...current, [key]: e.target.value }))}
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
                редактируется отдельно, в таблицах ниже.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(OWNER_MARGIN_FIELD_LABELS).map(([key, label]) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`cargo-${key}`}>{label}</Label>
                    <Input
                      id={`cargo-${key}`}
                      type="number"
                      step="0.01"
                      min={0}
                      value={tariffForm[key] ?? ""}
                      onChange={(e) => setTariffForm((current) => ({ ...current, [key]: e.target.value }))}
                      required
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {canEdit && (
            <div className="sm:col-span-2">
              {tariffError && <p className="mb-2 text-xs text-error">{tariffError}</p>}
              {savedTariffs && (
                <p className="mb-2 flex items-center gap-1 text-xs font-medium text-success">
                  <Check className="h-3.5 w-3.5" /> Сохранено.
                </p>
              )}
              <Button type="submit" disabled={savingTariffs}>
                {savingTariffs ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
              </Button>
            </div>
          )}
        </form>
      )}

      <div className="border-t border-border pt-6">
        {loadingThreshold ? (
          <p className="text-sm text-text-secondary">Загрузка…</p>
        ) : (
          <form onSubmit={handleSaveThreshold} className="max-w-sm space-y-1.5">
            <Label htmlFor="cargo-threshold">Порог «по объёму» вместо «по плотности», кг/м³</Label>
            <Input
              id="cargo-threshold"
              type="number"
              step="0.1"
              min={0}
              value={thresholdForm}
              onChange={(e) => setThresholdForm(e.target.value)}
              required
            />
            <p className="text-xs text-text-secondary">Ниже этой плотности доставка всегда считается «по объёму», для любой категории.</p>
            {thresholdError && <p className="text-xs text-error">{thresholdError}</p>}
            {savedThreshold && (
              <p className="flex items-center gap-1 text-xs font-medium text-success">
                <Check className="h-3.5 w-3.5" /> Сохранено.
              </p>
            )}
            <Button type="submit" size="sm" disabled={savingThreshold}>
              {savingThreshold ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
            </Button>
          </form>
        )}
      </div>

      <div className="border-t border-border pt-6">
        <Label>Страна назначения</Label>
        <p className="mt-1 text-xs text-text-secondary">
          Тарифы по плотности и по объёму ниже — отдельные для каждой страны. Пока настоящие ставки заведены только
          для России; остальные страны появятся здесь заготовкой без тарифов, пока вы их не заполните.
        </p>
        <Select value={selectedCountry} onValueChange={(v) => setSelectedCountry(v as DestinationCountry)}>
          <SelectTrigger className="mt-2 w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DESTINATION_COUNTRIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
          «по плотности», а не «по объёму». При плотности ниже порога (выше) доставка всегда считается по объёму —
          для любой категории, отдельный тариф здесь не нужен.
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
          менеджер выбрал этот режим, либо потому что плотность ниже порога (тогда категория берётся та же, что
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
    </div>
  );
}

export { ManagerCargoSettingsTab };
