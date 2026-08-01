"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface SystemSettingsRecord {
  fulfillmentPremiumRatePercent: string;
  updatedAt: string;
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
    </div>
  );
}

export { ManagerFulfillmentSettingsTab };
