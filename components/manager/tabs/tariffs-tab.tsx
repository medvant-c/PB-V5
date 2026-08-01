"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface TariffSettingsRecord {
  cnyRateRub: string;
  cnyRateRubTier3000: string | null;
  cnyRateRubTier10000: string | null;
  cnyRateRubTier30000: string | null;
  usdRateRub: string;
  standardPriceRub: string;
  expertPriceRub: string;
  proPriceRub: string;
  customProductionStandardRub: string;
  customProductionExpertRub: string;
  customProductionProRub: string;
  createdAt: string;
  // Present only for the owner — GET /api/manager-tariffs strips these for
  // everyone else, so their presence here doubles as "am I the owner."
  cargoDensityMarginUsdPerKg?: string;
  cnyProfitPerYuanRub?: string | null;
  cnyProfitPerYuanRubTier3000?: string | null;
  cnyProfitPerYuanRubTier10000?: string | null;
  cnyProfitPerYuanRubTier30000?: string | null;
}

interface TelegramCnyRateUpdateRecord {
  id: string;
  rateFrom1000: string | null;
  rateFrom3000: string | null;
  rateFrom10000: string | null;
  rateFrom30000: string | null;
  appliedRateRub: string | null;
  parseError: string | null;
  receivedAt: string;
}

const FIELD_LABELS: Record<
  keyof Omit<
    TariffSettingsRecord,
    | "createdAt"
    | "cargoDensityMarginUsdPerKg"
    | "cnyRateRubTier3000"
    | "cnyRateRubTier10000"
    | "cnyRateRubTier30000"
    | "cnyProfitPerYuanRub"
    | "cnyProfitPerYuanRubTier3000"
    | "cnyProfitPerYuanRubTier10000"
    | "cnyProfitPerYuanRubTier30000"
  >,
  string
> = {
  cnyRateRub: "Курс юаня (CNY → RUB) — от 1¥",
  usdRateRub: "Курс доллара (USD → RUB)",
  standardPriceRub: "Поиск товара Standart, ₽",
  expertPriceRub: "Поиск товара Expert, ₽",
  proPriceRub: "Поиск товара Pro, ₽",
  customProductionStandardRub: "Производство под заказ (Standart), ₽",
  customProductionExpertRub: "Производство под заказ (Expert), ₽",
  customProductionProRub: "Производство под заказ (Pro), ₽",
};

// Optional volume-based ¥ brackets — see CnyRateTiers in lib/quote-engine.ts.
// A quote's own total (product + China delivery + buyout commission +
// services, all in ¥) picks whichever bracket it reaches; usually filled in
// automatically by the Telegram webhook, editable by hand here too.
const CNY_TIER_FIELD_LABELS: Record<"cnyRateRubTier3000" | "cnyRateRubTier10000" | "cnyRateRubTier30000", string> = {
  cnyRateRubTier3000: "от 3000¥, ₽",
  cnyRateRubTier10000: "от 10 000¥, ₽",
  cnyRateRubTier30000: "от 30 000¥, ₽",
};

// Owner-only profit accounting — ₽ of profit per ¥ actually converted at
// each volume tier, separate from CNY_TIER_FIELD_LABELS above (what the
// client is charged). See TariffSettings.cnyProfitPerYuanRub* in
// prisma/schema.prisma.
const CNY_PROFIT_TIER_FIELD_LABELS: Record<
  "cnyProfitPerYuanRub" | "cnyProfitPerYuanRubTier3000" | "cnyProfitPerYuanRubTier10000" | "cnyProfitPerYuanRubTier30000",
  string
> = {
  cnyProfitPerYuanRub: "от 1¥, ₽/¥",
  cnyProfitPerYuanRubTier3000: "от 3000¥, ₽/¥",
  cnyProfitPerYuanRubTier10000: "от 10 000¥, ₽/¥",
  cnyProfitPerYuanRubTier30000: "от 30 000¥, ₽/¥",
};

// Тарифы sub-tab of «Настройки» — курсы валют, стоимость услуг поиска и
// производства под заказ. Карго-специфичные ставки (резервная ставка за
// м³, премия менеджеру, ваша маржа, тарифы по плотности/объёму) живут в
// соседней вкладке «Карго»; комиссия за выкуп — в «Просчёты и выкуп». See
// PB-V5 chat 2026-07-31.
function ManagerTariffsTab() {
  const [settings, setSettings] = useState<TariffSettingsRecord | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [telegramUpdates, setTelegramUpdates] = useState<TelegramCnyRateUpdateRecord[]>([]);
  const [loadingTelegramUpdates, setLoadingTelegramUpdates] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/manager-tariffs");
      const data = await res.json();
      if (res.ok) {
        setSettings(data.settings);
        setCanEdit(Boolean(data.canEdit));
        const baseForm = Object.fromEntries(Object.keys(FIELD_LABELS).map((key) => [key, String(data.settings[key])]));
        const tierForm = Object.fromEntries(
          [...Object.keys(CNY_TIER_FIELD_LABELS), ...Object.keys(CNY_PROFIT_TIER_FIELD_LABELS)].map((key) => [
            key,
            data.settings[key] !== null && data.settings[key] !== undefined ? String(data.settings[key]) : "",
          ]),
        );
        setForm({ ...baseForm, ...tierForm });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTelegramUpdates = useCallback(async () => {
    setLoadingTelegramUpdates(true);
    try {
      const res = await fetch("/api/telegram-cny-rate-updates");
      const data = await res.json();
      if (res.ok) setTelegramUpdates(data.updates);
    } finally {
      setLoadingTelegramUpdates(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (settings?.cargoDensityMarginUsdPerKg !== undefined) loadTelegramUpdates();
  }, [settings, loadTelegramUpdates]);

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

  const isOwner = settings?.cargoDensityMarginUsdPerKg !== undefined;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-bold text-text">Тарифы</h2>
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

          <div className="space-y-3 rounded-xl border border-dashed border-border bg-bg p-3 sm:col-span-2">
            <div className="text-xs font-semibold text-text-secondary">
              Курс юаня по сумме просчёта (необязательно)
            </div>
            <p className="text-xs text-text-secondary">
              Если сумма НОВОГО просчёта (товар + доставка по Китаю + комиссия за выкуп + услуги, в ¥) достигает
              одного из этих порогов, просчёт автоматически считается по указанному здесь курсу вместо курса «от
              1¥» выше. Обновляется само из телеграм-группы с курсами каждое утро — трогать вручную нужно, только
              если хотите поправить конкретную ступень. Пустое поле = ступени пока нет.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {Object.entries(CNY_TIER_FIELD_LABELS).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`tariff-${key}`}>{label}</Label>
                  <Input
                    id={`tariff-${key}`}
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="не задано"
                    value={form[key] ?? ""}
                    onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
                    disabled={!canEdit}
                  />
                </div>
              ))}
            </div>
          </div>

          {isOwner && (
            <div className="space-y-3 rounded-xl border border-dashed border-border bg-bg p-3 sm:col-span-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                <Lock className="h-3.5 w-3.5" /> Ваша прибыль с курса юаня — видно только руководителю
              </div>
              <p className="text-xs text-text-secondary">
                Сколько ₽ прибыли приносит каждый реально переведённый ¥ на этой ступени — не то, что берётся с
                клиента (это курс выше), а внутренний расчёт для «Отчёта о прибыли» и «Курсовой разницы» на
                дашборде. Пустое поле = 0 на этой ступени.
              </p>
              <div className="grid gap-3 sm:grid-cols-4">
                {Object.entries(CNY_PROFIT_TIER_FIELD_LABELS).map(([key, label]) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`tariff-${key}`}>{label}</Label>
                    <Input
                      id={`tariff-${key}`}
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="0"
                      value={form[key] ?? ""}
                      onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
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

      {isOwner && (
        <div className="border-t border-border pt-6">
          <h3 className="text-sm font-bold text-text">Автообновления курса из Телеграм-группы</h3>
          <p className="mt-1 text-sm text-text-secondary">
            Последние 20 сообщений с курсом, которые получил webhook — видно, применился ли курс и почему нет, если
            не применился. Видно только руководителю.
          </p>
          {loadingTelegramUpdates ? (
            <p className="mt-3 text-sm text-text-secondary">Загрузка…</p>
          ) : telegramUpdates.length === 0 ? (
            <p className="mt-3 text-sm text-text-secondary">Пока не было ни одного сообщения с курсом.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-150 border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg text-left text-xs text-text-secondary">
                    <th className="px-3 py-1.5 font-medium">Получено</th>
                    <th className="px-3 py-1.5 font-medium">от 1000¥</th>
                    <th className="px-3 py-1.5 font-medium">от 3000¥</th>
                    <th className="px-3 py-1.5 font-medium">от 10 000¥</th>
                    <th className="px-3 py-1.5 font-medium">от 30 000¥</th>
                    <th className="px-3 py-1.5 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {telegramUpdates.map((update) => (
                    <tr key={update.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-1.5 text-text-secondary">
                        {new Date(update.receivedAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="px-3 py-1.5 text-text">{update.rateFrom1000 ?? "—"}</td>
                      <td className="px-3 py-1.5 text-text">{update.rateFrom3000 ?? "—"}</td>
                      <td className="px-3 py-1.5 text-text">{update.rateFrom10000 ?? "—"}</td>
                      <td className="px-3 py-1.5 text-text">{update.rateFrom30000 ?? "—"}</td>
                      <td className="px-3 py-1.5">
                        {update.parseError ? (
                          <span className="text-error">{update.parseError}</span>
                        ) : (
                          <span className="text-success">✓ Применён</span>
                        )}
                      </td>
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

export { ManagerTariffsTab };
