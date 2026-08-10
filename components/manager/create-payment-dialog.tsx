"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseLocaleNumber } from "@/lib/number";

const CATEGORY_LABEL: Record<string, string> = {
  goods: "Товар",
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
// руководитель/старший менеджер picks WHICH SERVICES the client just paid
// for (a checkbox per "Счёт на выкуп" category, applied uniformly across
// every selected quote), not a manual amount per quote — each checked
// category is billed at its FULL remaining balance on every quote that
// still owes something for it. A category already fully paid on some (or
// all) of the selected quotes is called out by name instead of silently
// contributing 0, so the manager knows exactly why the total looks smaller
// than expected. See app/api/manager-quotes/create-payment and PB-V5 chat
// 2026-08-05.
function CreatePaymentDialog({ open, onOpenChange, quoteIds, onSaved }: CreatePaymentDialogProps) {
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<{ name: string; company: string | null } | null>(null);
  const [quotes, setQuotes] = useState<RemainingQuote[]>([]);
  const [checkedCategories, setCheckedCategories] = useState<Record<string, boolean>>({});
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [accountId, setAccountId] = useState("");
  const [cnyRate, setCnyRate] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setCheckedCategories({});
    setComment("");
    Promise.all([
      fetch(`/api/manager-quotes/payment-remaining?quoteIds=${quoteIds.join(",")}`).then((res) => res.json()),
      fetch("/api/manager-tariffs").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/manager-payment-accounts").then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([remainingData, tariffsData, accountsData]) => {
        if (remainingData.error) {
          setError(remainingData.error);
          return;
        }
        setClient(remainingData.client);
        setQuotes(remainingData.quotes ?? []);
        if (tariffsData?.settings?.cnyRateRub) setCnyRate(String(tariffsData.settings.cnyRateRub));
        const fetchedAccounts = accountsData?.accounts ?? [];
        setAccounts(fetchedAccounts);
        setAccountId(fetchedAccounts[0]?.id ?? "");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- quoteIds is an array literal from the caller, re-running on open is what matters
  }, [open]);

  // Per category: total still owed across every selected quote, plus which
  // quotes have nothing left for it (already covered by an earlier order)
  // so that gets called out by name instead of just quietly not counting.
  const categoryInfo = useMemo(() => {
    return CATEGORIES.map((category) => {
      const owing = quotes.filter((q) => (q.remaining[category] ?? 0) > 0);
      const alreadyPaid = quotes.filter((q) => (q.remaining[category] ?? 0) <= 0);
      const totalRemaining = owing.reduce((sum, q) => sum + q.remaining[category], 0);
      return { category, owing, alreadyPaid, totalRemaining };
    });
  }, [quotes]);

  const allocations = useMemo(() => {
    return categoryInfo
      .filter((info) => checkedCategories[info.category])
      .flatMap((info) => info.owing.map((q) => ({ quoteId: q.quoteId, category: info.category, amountRub: q.remaining[info.category] })));
  }, [categoryInfo, checkedCategories]);

  const totalRub = allocations.reduce((sum, a) => sum + a.amountRub, 0);
  const cnyRateNum = parseLocaleNumber(cnyRate || "0");
  const totalCny = Number.isFinite(cnyRateNum) && cnyRateNum > 0 ? totalRub / cnyRateNum : 0;

  async function handleSave() {
    if (allocations.length === 0) {
      setError("Выберите хотя бы одну услугу, по которой есть остаток к оплате.");
      return;
    }
    if (!Number.isFinite(cnyRateNum) || cnyRateNum <= 0) {
      setError("Укажите курс юаня.");
      return;
    }
    if (!accountId) {
      setError("Укажите счёт, на который поступит оплата.");
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
          accountId,
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
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
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
              Выберите, по каким услугам клиент оплатил — сумма посчитается сама, как остаток по этой услуге на
              каждом из {quotes.length} выбранных просчётов ({quotes.map((q) => `№${q.displayId}`).join(", ")}).
            </p>

            {error && <p className="text-xs text-error">{error}</p>}

            <div className="space-y-2">
              {categoryInfo.map(({ category, owing, alreadyPaid, totalRemaining }) => {
                const disabled = owing.length === 0;
                return (
                  <label
                    key={category}
                    className={`flex items-start gap-2.5 rounded-lg border p-3 ${
                      disabled ? "cursor-not-allowed border-border bg-bg opacity-60" : "cursor-pointer border-border hover:border-primary/30"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      disabled={disabled}
                      checked={Boolean(checkedCategories[category])}
                      onChange={(e) => setCheckedCategories((c) => ({ ...c, [category]: e.target.checked }))}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-text">{CATEGORY_LABEL[category]}</span>
                        {!disabled && <span className="text-sm font-bold text-text">{fmt(totalRemaining)} ₽</span>}
                      </div>
                      {disabled ? (
                        <p className="text-xs text-text-secondary">Уже полностью оплачено по всем выбранным просчётам.</p>
                      ) : (
                        alreadyPaid.length > 0 && (
                          <p className="text-xs text-warning">
                            Уже ранее оплачено по: {alreadyPaid.map((q) => `№${q.displayId}`).join(", ")} — счёт будет только по{" "}
                            {owing.map((q) => `№${q.displayId}`).join(", ")}.
                          </p>
                        )
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Счёт зачисления</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Выберите счёт" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
              <Button type="button" onClick={handleSave} disabled={saving || totalRub <= 0 || !accountId}>
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
