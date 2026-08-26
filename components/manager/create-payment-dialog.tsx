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
// Те же категории, что PREMIUM_ELIGIBLE_PAYMENT_CATEGORIES в
// lib/desk-services/quote-profit.ts (сервер — единственный источник
// правды и там же проверяется ещё раз) — 100% маржа, без привязанной
// себестоимости, поэтому по ним можно ввести сумму больше расчётного
// остатка (округление в пользу клиента, курсовая наценка бота и т.п. —
// реальная допприбыль, а не переплата за конкретный товар). "Товар"/
// "Доставка по Китаю" остаются жёстко ограничены остатком. См. PB-V5
// chat 2026-08-26.
const MARGIN_CATEGORIES = new Set(["search_service", "custom_production", "buyout_commission", "attached_services"]);

function allocationKey(quoteId: string, category: string): string {
  return `${quoteId}__${category}`;
}

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
// for (a checkbox per "Счёт на выкуп" category, applied per quote it
// applies to), defaulting to that quote's own FULL remaining balance but
// editable — see MARGIN_CATEGORIES above for which categories allow
// entering more than the computed remaining. A category already fully
// paid on some (or all) of the selected quotes is called out by name
// instead of silently contributing 0, so the manager knows exactly why
// the default total looks smaller than expected. See
// app/api/manager-quotes/create-payment and PB-V5 chat 2026-08-05,
// extended 2026-08-26.
function CreatePaymentDialog({ open, onOpenChange, quoteIds, onSaved }: CreatePaymentDialogProps) {
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<{ name: string; company: string | null } | null>(null);
  const [quotes, setQuotes] = useState<RemainingQuote[]>([]);
  const [checkedCategories, setCheckedCategories] = useState<Record<string, boolean>>({});
  // Редактируемая сумма на каждую пару (просчёт, категория) — ключ через
  // allocationKey. Инициализируется остатком по умолчанию при загрузке
  // просчётов, дальше менеджер может её поправить (см. MARGIN_CATEGORIES
  // выше — куда именно можно ввести больше остатка).
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
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
    setCustomAmounts({});
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
        const fetchedQuotes: RemainingQuote[] = remainingData.quotes ?? [];
        setQuotes(fetchedQuotes);
        // По умолчанию — весь остаток, как и раньше; менеджер правит
        // точечно, только там, где это реально нужно.
        const defaults: Record<string, string> = {};
        for (const q of fetchedQuotes) {
          for (const category of CATEGORIES) {
            defaults[allocationKey(q.quoteId, category)] = String(q.remaining[category] ?? 0);
          }
        }
        setCustomAmounts(defaults);
        if (tariffsData?.settings?.cnyRateRub) setCnyRate(String(tariffsData.settings.cnyRateRub));
        const fetchedAccounts = accountsData?.accounts ?? [];
        setAccounts(fetchedAccounts);
        setAccountId(fetchedAccounts[0]?.id ?? "");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- quoteIds is an array literal from the caller, re-running on open is what matters
  }, [open]);

  // Per category: which quotes can actually receive an allocation here.
  // Безмаржинальные категории (MARGIN_CATEGORIES) — все выбранные
  // просчёты, даже с нулевым остатком: по ним разрешено ввести сумму
  // сверху (см. комментарий у MARGIN_CATEGORIES). Остальные — только те,
  // где реально что-то ещё не оплачено, ровно как раньше.
  const categoryInfo = useMemo(() => {
    return CATEGORIES.map((category) => {
      const owing = quotes.filter((q) => (q.remaining[category] ?? 0) > 0);
      const alreadyPaid = quotes.filter((q) => (q.remaining[category] ?? 0) <= 0);
      const applicable = MARGIN_CATEGORIES.has(category) ? quotes : owing;
      const totalRemaining = owing.reduce((sum, q) => sum + q.remaining[category], 0);
      return { category, owing, alreadyPaid, applicable, totalRemaining };
    });
  }, [quotes]);

  const allocations = useMemo(() => {
    return categoryInfo
      .filter((info) => checkedCategories[info.category])
      .flatMap((info) =>
        info.applicable.map((q) => ({
          quoteId: q.quoteId,
          category: info.category,
          amountRub: parseLocaleNumber(customAmounts[allocationKey(q.quoteId, info.category)] || "0"),
        })),
      )
      .filter((a) => Number.isFinite(a.amountRub) && a.amountRub > 0);
  }, [categoryInfo, checkedCategories, customAmounts]);

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
              Выберите, по каким услугам клиент оплатил — сумма по умолчанию равна остатку, но её можно поправить
              вручную на {quotes.length === 1 ? "просчёте" : "любом из выбранных просчётов"} (
              {quotes.map((q) => `№${q.displayId}`).join(", ")}
              ). По «Товару»/«Доставке по Китаю» больше остатка ввести нельзя, по остальным — можно (округление,
              курсовая наценка и т.п. — реальная допприбыль).
            </p>

            {error && <p className="text-xs text-error">{error}</p>}

            <div className="space-y-2">
              {categoryInfo.map(({ category, owing, alreadyPaid, applicable, totalRemaining }) => {
                const disabled = applicable.length === 0;
                const checked = Boolean(checkedCategories[category]);
                const isMargin = MARGIN_CATEGORIES.has(category);
                return (
                  <div
                    key={category}
                    className={`rounded-lg border p-3 ${disabled ? "border-border bg-bg opacity-60" : "border-border"}`}
                  >
                    <label className={`flex items-start gap-2.5 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        disabled={disabled}
                        checked={checked}
                        onChange={(e) => setCheckedCategories((c) => ({ ...c, [category]: e.target.checked }))}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-text">{CATEGORY_LABEL[category]}</span>
                          {!disabled && !checked && <span className="text-sm font-bold text-text">{fmt(totalRemaining)} ₽</span>}
                        </div>
                        {disabled ? (
                          <p className="text-xs text-text-secondary">Уже полностью оплачено по всем выбранным просчётам.</p>
                        ) : (
                          !checked &&
                          alreadyPaid.length > 0 &&
                          !isMargin && (
                            <p className="text-xs text-warning">
                              Уже ранее оплачено по: {alreadyPaid.map((q) => `№${q.displayId}`).join(", ")} — счёт будет только по{" "}
                              {owing.map((q) => `№${q.displayId}`).join(", ")}.
                            </p>
                          )
                        )}
                      </div>
                    </label>

                    {checked && (
                      <div className="mt-2 space-y-1.5 pl-6">
                        {applicable.map((q) => {
                          const key = allocationKey(q.quoteId, category);
                          const remaining = q.remaining[category] ?? 0;
                          return (
                            <div key={q.quoteId} className="flex items-center justify-between gap-2">
                              {applicable.length > 1 && (
                                <span className="shrink-0 text-xs text-text-secondary">№{q.displayId}</span>
                              )}
                              <div className="flex flex-1 items-center justify-end gap-1.5">
                                {!isMargin && (
                                  <span className="text-xs text-text-secondary">остаток {fmt(remaining)} ₽</span>
                                )}
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={customAmounts[key] ?? "0"}
                                  onChange={(e) => setCustomAmounts((c) => ({ ...c, [key]: e.target.value }))}
                                  className="h-7 w-28 text-right text-sm"
                                />
                                <span className="text-xs text-text-secondary">₽</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
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
