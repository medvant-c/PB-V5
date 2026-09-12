"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface SystemSettingsRecord {
  fulfillmentPremiumRatePercent: string;
  updatedAt: string;
}

type ServiceScope = "item" | "order";

interface ServiceItemRecord {
  id: string;
  name: string;
  scope: ServiceScope;
  priceCny: string;
  priceRub: string;
}

function money(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

const SCOPE_TITLE: Record<ServiceScope, string> = {
  item: "Услуги к товару",
  order: "Услуги к заявке",
};

const SCOPE_HINT: Record<ServiceScope, string> = {
  item: "Привязаны к конкретному товару — приёмка, маркировка единицы и т.п. Доступны в карточке товара и в позициях заявки.",
  order: "Относятся к заявке в целом, результат известен только после обработки — например «Формирование короба». Доступны в разделе «Услуги на партию целиком».",
};

// Прайс-лист услуг фулфилмента — намеренно НЕ гейтится canEdit выше (это
// owner-only настройка премии менеджеру), у каталога услуг своя, более
// широкая граница доступа: любая сессия менеджера может читать и править
// (см. app/api/manager-fulfillment-services/route.ts) — реальная защита
// данных клиента живёт в scoping заказов/клиентов, не в этом справочнике.
// Раньше жил прямо во вкладке «Фулфилмент» (свёрнутая панель внизу) —
// перенесено сюда по просьбе пользователя, там же, где остальные базовые
// цены/тарифы. Два прайс-листа (scope) вместо одного — услуги к товару и
// услуги к заявке целиком — разные наборы для разных экранов создания
// заявки. См. PB-V5 chat 2026-09-12.
function FulfillmentServicePriceList({ scope }: { scope: ServiceScope }) {
  const [services, setServices] = useState<ServiceItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceDrafts, setServiceDrafts] = useState<Record<string, { name: string; priceCny: string }>>({});
  const [busyServiceId, setBusyServiceId] = useState<string | null>(null);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [panelError, setPanelError] = useState<string | null>(null);

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/manager-fulfillment-services?scope=${scope}`);
      const data = await res.json();
      if (res.ok) setServices(data.items);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  async function handleSaveService(id: string, original: ServiceItemRecord) {
    const draft = serviceDrafts[id];
    if (!draft || (draft.name === original.name && draft.priceCny === original.priceCny)) return;
    setBusyServiceId(id);
    setPanelError(null);
    try {
      const res = await fetch(`/api/manager-fulfillment-services/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, priceCny: Number(draft.priceCny) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPanelError(data.error ?? "Не удалось сохранить услугу.");
        return;
      }
      await loadServices();
    } finally {
      setBusyServiceId(null);
    }
  }

  async function handleDeleteService(id: string) {
    if (!window.confirm("Удалить эту услугу из прайс-листа?")) return;
    setBusyServiceId(id);
    try {
      const res = await fetch(`/api/manager-fulfillment-services/${id}`, { method: "DELETE" });
      if (res.ok) await loadServices();
    } finally {
      setBusyServiceId(null);
    }
  }

  async function handleCreateService() {
    if (!newServiceName.trim() || !newServicePrice) return;
    setPanelError(null);
    const res = await fetch("/api/manager-fulfillment-services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newServiceName.trim(), priceCny: Number(newServicePrice), scope }),
    });
    const data = await res.json();
    if (!res.ok) {
      setPanelError(data.error ?? "Не удалось добавить услугу.");
      return;
    }
    setNewServiceName("");
    setNewServicePrice("");
    await loadServices();
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border bg-bg p-3">
      <div>
        <h3 className="text-sm font-semibold text-text">{SCOPE_TITLE[scope]}</h3>
        <p className="mt-0.5 text-xs text-text-secondary">{SCOPE_HINT[scope]} Цены в ¥ — ₽ пересчитывается автоматически по текущему курсу.</p>
      </div>
      {loading ? (
        <p className="text-sm text-text-secondary">Загрузка…</p>
      ) : (
        <div className="space-y-1.5">
          {services.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5">
              <Input
                value={serviceDrafts[s.id]?.name ?? s.name}
                onChange={(e) => setServiceDrafts((c) => ({ ...c, [s.id]: { name: e.target.value, priceCny: c[s.id]?.priceCny ?? s.priceCny } }))}
                onBlur={() => handleSaveService(s.id, s)}
                disabled={busyServiceId === s.id}
                className="h-8 min-w-0 flex-1 text-sm"
              />
              <Input
                type="number"
                step="0.01"
                value={serviceDrafts[s.id]?.priceCny ?? s.priceCny}
                onChange={(e) => setServiceDrafts((c) => ({ ...c, [s.id]: { name: c[s.id]?.name ?? s.name, priceCny: e.target.value } }))}
                onBlur={() => handleSaveService(s.id, s)}
                disabled={busyServiceId === s.id}
                className="h-8 w-24 shrink-0 text-sm"
              />
              <span className="shrink-0 text-xs text-text-secondary">≈{money(Number(s.priceRub))} ₽</span>
              <button
                type="button"
                onClick={() => handleDeleteService(s.id)}
                disabled={busyServiceId === s.id}
                className="shrink-0 text-text-secondary hover:text-error disabled:opacity-50"
                aria-label="Удалить услугу"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Input placeholder="Название услуги" value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} className="h-8 text-sm" />
            <Input
              type="number"
              step="0.01"
              placeholder="¥"
              value={newServicePrice}
              onChange={(e) => setNewServicePrice(e.target.value)}
              className="h-8 w-24 shrink-0 text-sm"
            />
            <Button type="button" size="sm" onClick={handleCreateService}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {panelError && <p className="text-xs text-error">{panelError}</p>}
        </div>
      )}
    </div>
  );
}

function ManagerFulfillmentSettingsTab() {
  const [settings, setSettings] = useState<SystemSettingsRecord | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [form, setForm] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/manager-settings");
      const data = await res.json();
      if (res.ok) {
        setSettings(data.settings);
        setCanEdit(Boolean(data.canEdit));
        setForm(data.settings.fulfillmentPremiumRatePercent);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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
        body: JSON.stringify({ fulfillmentPremiumRatePercent: form }),
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-bold text-text">Фулфилмент</h2>
        {settings && (
          <p className="mt-1 text-xs text-text-secondary">
            Обновлено: {new Date(settings.updatedAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-text-secondary">Загрузка…</p>
      ) : (
        <form onSubmit={handleSave} className="max-w-sm space-y-1.5">
          {!canEdit && (
            <p className="mb-2 rounded-lg bg-bg px-3 py-2 text-xs text-text-secondary">
              Изменять может только руководитель.
            </p>
          )}
          <Label htmlFor="fulfillment-rate">Премия менеджеру за фулфилмент, %</Label>
          <Input
            id="fulfillment-rate"
            type="number"
            step="0.01"
            min={0}
            max={100}
            value={form}
            onChange={(e) => setForm(e.target.value)}
            disabled={!canEdit}
            required
          />
          <p className="text-xs text-text-secondary">
            Только для подтверждённого личного клиента — от выставленной клиенту суммы. Для лида компании менеджер
            с фулфилмента ничего не получает.
          </p>
          {canEdit && (
            <div className="pt-2">
              {error && <p className="mb-2 text-xs text-error">{error}</p>}
              {saved && (
                <p className="mb-2 flex items-center gap-1 text-xs font-medium text-success">
                  <Check className="h-3.5 w-3.5" /> Сохранено.
                </p>
              )}
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
              </Button>
            </div>
          )}
        </form>
      )}

      <FulfillmentServicePriceList scope="item" />
      <FulfillmentServicePriceList scope="order" />
    </div>
  );
}

export { ManagerFulfillmentSettingsTab };
