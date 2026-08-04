"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { parseLocaleNumber } from "@/lib/number";

const CATEGORY_LABEL: Record<string, string> = {
  goods: "Стоимость товара",
  china_delivery: "Доставка по Китаю",
  search_service: "Услуга поиска",
  custom_production: "Производство под заказ",
  buyout_commission: "Комиссия за выкуп",
  attached_services: "Доп. услуги",
};
const CATEGORIES = Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[];

interface RemainingQuote {
  quoteId: string;
  displayId: number;
  productName: string;
  remaining: Record<string, number>;
}

function fmt(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

interface CreatePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteIds: string[];
  onSaved: () => void;
}

// "Приходный ордер" started from a quote card's checkbox selection —
// owner/senior picks how much the client just paid toward which service on
// which of the selected quotes, all in one dialog (one real payment can
// cover several quotes at once). See app/api/manager-quotes/create-payment
// and PB-V5 chat 2026-08-04.
function CreatePaymentDialog({ open, onOpenChange, quoteIds, onSaved }: CreatePaymentDialogProps) {
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<{ name: string; company: string | null } | null>(null);
  const [quotes, setQuotes] = useState<RemainingQuote[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [cnyRate, setCnyRate] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setDrafts({});
    setComment("");
    Promise.all([
      fetch(`/api/manager-quotes/payment-remaining?quoteIds=${quoteIds.join(",")}`).then((res) => res.json()),
      fetch("/api/manager-tariffs").then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([remainingData, tariffsData]) => {
        if (remainingData.error) {
          setError(remainingData.error);
          return;
        }
        setClient(remainingData.client);
        setQuotes(remainingData.quotes ?? []);
        if (tariffsData?.settings?.cnyRateRub) setCnyRate(String(tariffsData.settings.cnyRateRub));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- quoteIds is an array literal from the caller, re-running on open is what matters
  }, [open]);

  const totalRub = useMemo(() => {
    return Object.values(drafts).reduce((sum, v) => {
      const n = parseLocaleNumber(v || "0");
      return sum + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
  }, [drafts]);

  const cnyRateNum = parseLocaleNumber(cnyRate || "0");
  const totalCny = Number.isFinite(cnyRateNum) && cnyRateNum > 0 ? totalRub / cnyRateNum : 0;

  async function handleSave() {
    const allocations = Object.entries(drafts)
      .map(([key, value]) => {
        const [quoteId, category] = key.split(":");
        const amountRub = parseLocaleNumber(value || "0");
        return { quoteId, category, amountRub };
      })
      .filter((a) => Number.isFinite(a.amountRub) && a.amountRub > 0);

    if (allocations.length === 0) {
      setError("Укажите хотя бы одну сумму по услуге.");
      return;
    }
    if (!Number.isFinite(cnyRateNum) || cnyRateNum <= 0) {
      setError("Укажите курс юаня.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/manager-quotes/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountRub: totalRub,
          cnyToCurrencyRate: cnyRateNum,
          date: new Date(date).toISOString(),
          comment,
          allocations,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Не удалось создать приходный ордер.");
        return;
      }
      onSaved();
      onOpenChange(false);
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Приходный ордер{client ? ` — ${client.name}${client.company ? ` · ${client.company}` : ""}` : ""}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-text-secondary">Загрузка…</p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-text-secondary">
              Укажите, сколько клиент оплатил и по каким услугам каких просчётов это распределяется. Уже оплаченные
              услуги (остаток 0) в списке не показаны.
            </p>

            {error && <p className="text-xs text-error">{error}</p>}

            {quotes.map((q) => {
              const availableCategories = CATEGORIES.filter((c) => (q.remaining[c] ?? 0) > 0);
              if (availableCategories.length === 0) {
                return (
                  <div key={q.quoteId} className="rounded-lg border border-border bg-bg p-3 text-xs text-text-secondary">
                    №{q.displayId} · {q.productName} — уже полностью оплачен.
                  </div>
                );
              }
              return (
                <div key={q.quoteId} className="space-y-2 rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold text-text">
                    №{q.displayId} · {q.productName}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {availableCategories.map((category) => {
                      const key = `${q.quoteId}:${category}`;
                      return (
                        <div key={key} className="space-y-1">
                          <Label htmlFor={key} className="text-xs font-normal text-text-secondary">
                            {CATEGORY_LABEL[category]} — остаток {fmt(q.remaining[category])} ₽
                          </Label>
                          <Input
                            id={key}
                            type="text"
                            inputMode="decimal"
                            placeholder="0"
                            value={drafts[key] ?? ""}
                            onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                            className="h-8 text-sm"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="payment-cny-rate">Курс юаня, 1¥ = X₽</Label>
                <Input
                  id="payment-cny-rate"
                  type="text"
                  inputMode="decimal"
                  value={cnyRate}
                  onChange={(e) => setCnyRate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-date">Дата</Label>
                <Input id="payment-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="payment-comment">Комментарий (необязательно)</Label>
                <Textarea id="payment-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-bg p-3">
              <span className="text-sm font-medium text-text">Итого к ордеру</span>
              <span className="text-sm font-bold text-text">
                {fmt(totalRub)} ₽ {totalCny > 0 && `≈ ${fmt(totalCny)} ¥`}
              </span>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" /> Отмена
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving || totalRub <= 0}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Создать ордер"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { CreatePaymentDialog };
