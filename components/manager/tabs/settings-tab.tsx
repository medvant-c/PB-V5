"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface SystemSettingsRecord {
  normalRatePercent: string;
  selfSourcedProscetRatePercent: string;
  selfSourcedBuyoutDiscountRatePercent: string;
  vladShareRatePercent: string;
  fulfillmentPremiumRatePercent: string;
  freeStandardQuoteLimit: number;
  lowDensityVolumeThresholdKgM3: string;
  premiumExplanationText: string;
  incomeSummaryText: string;
  incomeDetailText: string;
  updatedAt: string;
}

const PERCENT_FIELD_LABELS: Record<
  "normalRatePercent" | "selfSourcedProscetRatePercent" | "selfSourcedBuyoutDiscountRatePercent" | "vladShareRatePercent" | "fulfillmentPremiumRatePercent",
  { label: string; hint: string }
> = {
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
  vladShareRatePercent: {
    label: "Доля Влада (Партнёр), %",
    hint: "Берётся сверху с прибыли по каждой подтверждённой сделке, независимо от источника клиента.",
  },
  fulfillmentPremiumRatePercent: {
    label: "Премия за фулфилмент, %",
    hint: "Только для подтверждённого личного клиента — от выставленной клиенту суммы.",
  },
};

const TEXT_FIELD_LABELS: Record<"premiumExplanationText" | "incomeSummaryText" | "incomeDetailText", { label: string; hint: string }> = {
  premiumExplanationText: {
    label: "Дашборд — «Как считается премия»",
    hint: "Показывается всем менеджерам, над «В работе».",
  },
  incomeSummaryText: {
    label: "Дашборд — «Разбивка дохода», краткое пояснение",
    hint: "Показывается только руководителю, короткий абзац над карточками.",
  },
  incomeDetailText: {
    label: "Дашборд — «Как считается доход» (разворачиваемый блок)",
    hint: "Показывается только руководителю, под кнопкой «Как считается доход».",
  },
};

function ManagerSettingsTab() {
  const [settings, setSettings] = useState<SystemSettingsRecord | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
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
        setForm({
          normalRatePercent: data.settings.normalRatePercent,
          selfSourcedProscetRatePercent: data.settings.selfSourcedProscetRatePercent,
          selfSourcedBuyoutDiscountRatePercent: data.settings.selfSourcedBuyoutDiscountRatePercent,
          vladShareRatePercent: data.settings.vladShareRatePercent,
          fulfillmentPremiumRatePercent: data.settings.fulfillmentPremiumRatePercent,
          freeStandardQuoteLimit: String(data.settings.freeStandardQuoteLimit),
          lowDensityVolumeThresholdKgM3: data.settings.lowDensityVolumeThresholdKgM3,
          premiumExplanationText: data.settings.premiumExplanationText,
          incomeSummaryText: data.settings.incomeSummaryText,
          incomeDetailText: data.settings.incomeDetailText,
        });
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
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось сохранить настройки.");
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
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-bold text-text">Настройки</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Ставки премий, лимиты и тексты подсказок — то, что раньше можно было поменять только правкой кода. Просчёты
          и премии, уже посчитанные с прежними значениями, не меняются задним числом.
        </p>
        {settings && (
          <p className="mt-1 text-xs text-text-secondary">
            Обновлено: {new Date(settings.updatedAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-text-secondary">Загрузка…</p>
      ) : (
        <form onSubmit={handleSave} className="space-y-8">
          {!canEdit && (
            <p className="rounded-lg bg-bg px-3 py-2 text-xs text-text-secondary">
              Изменять системные настройки может только руководитель. Текущие значения видны ниже.
            </p>
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-text">Ставки премий менеджеров</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(PERCENT_FIELD_LABELS).map(([key, { label, hint }]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`settings-${key}`}>{label}</Label>
                  <Input
                    id={`settings-${key}`}
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
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-6">
            <h3 className="text-sm font-bold text-text">Пороги и лимиты</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="settings-freeStandardQuoteLimit">Бесплатных просчётов Standart на клиента, шт</Label>
                <Input
                  id="settings-freeStandardQuoteLimit"
                  type="number"
                  step="1"
                  min={0}
                  value={form.freeStandardQuoteLimit ?? ""}
                  onChange={(e) => setForm((current) => ({ ...current, freeStandardQuoteLimit: e.target.value }))}
                  disabled={!canEdit}
                  required
                />
                <p className="text-xs text-text-secondary">
                  Действует только для новых просчётов — уже созданные не пересчитываются.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settings-lowDensityVolumeThresholdKgM3">Порог «по объёму» вместо «по плотности», кг/м³</Label>
                <Input
                  id="settings-lowDensityVolumeThresholdKgM3"
                  type="number"
                  step="0.1"
                  min={0}
                  value={form.lowDensityVolumeThresholdKgM3 ?? ""}
                  onChange={(e) => setForm((current) => ({ ...current, lowDensityVolumeThresholdKgM3: e.target.value }))}
                  disabled={!canEdit}
                  required
                />
                <p className="text-xs text-text-secondary">
                  Ниже этой плотности доставка всегда считается «по объёму», для любой категории.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-6">
            <h3 className="text-sm font-bold text-text">Тексты подсказок на дашборде</h3>
            <p className="text-xs text-text-secondary">
              Пустая строка между абзацами — новый абзац. <code className="rounded bg-bg px-1">**слово**</code> —
              жирный текст.
            </p>
            {Object.entries(TEXT_FIELD_LABELS).map(([key, { label, hint }]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`settings-${key}`}>{label}</Label>
                <Textarea
                  id={`settings-${key}`}
                  rows={5}
                  value={form[key] ?? ""}
                  onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
                  disabled={!canEdit}
                />
                <p className="text-xs text-text-secondary">{hint}</p>
              </div>
            ))}
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
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить настройки"}
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

export { ManagerSettingsTab };
