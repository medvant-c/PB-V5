"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface SystemSettingsRecord {
  premiumExplanationText: string;
  incomeSummaryText: string;
  incomeDetailText: string;
  updatedAt: string;
}

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

function ManagerTextsSettingsTab() {
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
        <h2 className="text-sm font-bold text-text">Тексты и подсказки</h2>
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
              Изменять может только руководитель.
            </p>
          )}
          <p className="text-xs text-text-secondary">
            Пустая строка между абзацами — новый абзац. <code className="rounded bg-bg px-1">**слово**</code> —
            жирный текст.
          </p>
          {Object.entries(TEXT_FIELD_LABELS).map(([key, { label, hint }]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`texts-${key}`}>{label}</Label>
              <Textarea
                id={`texts-${key}`}
                rows={5}
                value={form[key] ?? ""}
                onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
                disabled={!canEdit}
              />
              <p className="text-xs text-text-secondary">{hint}</p>
            </div>
          ))}

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
    </div>
  );
}

export { ManagerTextsSettingsTab };
