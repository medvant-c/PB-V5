"use client";

// Общие типы/хелперы/компоненты между под-вкладками Фулфилмента
// («Клиенты», «Заявки на обработку», «Отгрузки») — вынесено при разбивке
// fulfillment-tab.tsx на под-вкладки (см. settings-tab.tsx — тот же
// паттерн SUB_TABS). См. план «Фулфилмент: под-вкладки», PB-V5 chat
// 2026-09-12.

import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PeriodFilter = "all" | "day" | "week" | "month" | "year";

export const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "day", label: "День" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "year", label: "Год" },
];

// Start of the period containing `now` — "день" is today, "неделя" is the
// last 7 days, etc. (rolling windows, not calendar-boundary weeks/months).
export function periodStart(period: PeriodFilter): Date | null {
  if (period === "all") return null;
  const days = { day: 1, week: 7, month: 30, year: 365 }[period];
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export const CODE_RE = /^\d{4}[A-Za-z]{2}$/;

export type ServiceScope = "item" | "order";

export interface ServiceItemRecord {
  id: string;
  name: string;
  scope: ServiceScope;
  priceCny: string;
  priceRub: string;
}

export interface ClientOption {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  messenger: string | null;
  email: string | null;
  fulfillmentCode: string | null;
  createdByManagerId: string | null;
  createdByManager: { name: string } | null;
  archivedAt: string | null;
}

export interface QuoteOption {
  id: string;
  displayId: number;
  productName: string;
}

export interface ProductCardServiceRecord {
  id: string;
  serviceItemId: string | null;
  name: string;
  priceCny: string;
  priceRub: string;
}

export type MarketplaceFlow = "fbs" | "fbo" | "both";

export const MARKETPLACE_FLOW_LABEL: Record<MarketplaceFlow, string> = {
  fbs: "FBS",
  fbo: "FBO",
  both: "FBS + FBO",
};

export const MARKETPLACE_FLOW_BADGE_CLASSES: Record<MarketplaceFlow, string> = {
  fbs: "bg-primary/10 text-primary",
  fbo: "bg-purple-500/10 text-purple-600",
  both: "bg-gradient-to-r from-primary/10 to-purple-500/10 text-text",
};

export interface ProductCardRecord {
  id: string;
  clientId: string;
  name: string;
  sku: string | null;
  description: string | null;
  dimensions: string | null;
  marketplaceFlow: MarketplaceFlow | null;
  weightPerUnitKg: string | null;
  packaging: string | null;
  barcodeWb: string | null;
  barcodeOzon: string | null;
  barcodeYm: string | null;
  barcodeAmazon: string | null;
  photoId: string | null;
  services: ProductCardServiceRecord[];
}

export function money(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

// ¥ — основная валюта (менеджер заводит услуги в юанях), ₽ — только
// справочно, тем же способом, что и при вводе цены.
export function moneyCny(cnyValue: number, rubValue: number): string {
  return `${cnyValue.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ¥ · ≈${money(rubValue)} ₽`;
}

// Одна строка "услуга" — переиспользуется и для услуг на позиции товара, и
// для услуг на партию целиком. serviceItemId != null — привязана к
// глобальному каталогу (имя/цена автоподставляются оттуда, но остаются
// редактируемыми — снэпшот, не живая ссылка); null — своя, свободная.
export interface ServiceLine {
  key: string;
  serviceItemId: string | null;
  name: string;
  priceCny: string;
  quantity: string;
}

export function blankServiceLine(): ServiceLine {
  return { key: crypto.randomUUID(), serviceItemId: null, name: "", priceCny: "", quantity: "1" };
}

export function serviceLineTotalRub(line: ServiceLine, cnyRateRub: number): number {
  return (Number(line.priceCny) || 0) * cnyRateRub * (Number(line.quantity) || 0);
}

export function serviceLineTotalCny(line: ServiceLine): number {
  return (Number(line.priceCny) || 0) * (Number(line.quantity) || 0);
}

// Строка "услуга": каталожный пикер (auto-подставляет имя/цену) + своё имя/
// цена, если ничего не выбрано или выбрано "Своя услуга". Используется и
// внутри позиции товара, и на уровне заказа целиком.
export function ServiceLineEditor({
  lines,
  services,
  cnyRateRub,
  onChange,
}: {
  lines: ServiceLine[];
  services: ServiceItemRecord[];
  cnyRateRub: number;
  onChange: (lines: ServiceLine[]) => void;
}) {
  function update(key: string, patch: Partial<ServiceLine>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function remove(key: string) {
    onChange(lines.filter((l) => l.key !== key));
  }
  function add() {
    onChange([...lines, blankServiceLine()]);
  }
  function pickCatalog(key: string, serviceItemId: string) {
    if (!serviceItemId) {
      update(key, { serviceItemId: null });
      return;
    }
    const catalogItem = services.find((s) => s.id === serviceItemId);
    if (!catalogItem) return;
    update(key, { serviceItemId, name: catalogItem.name, priceCny: catalogItem.priceCny });
  }

  return (
    <div className="space-y-1.5">
      {lines.map((line) => (
        <div key={line.key} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5">
          <Select value={line.serviceItemId ?? "__custom__"} onValueChange={(v) => pickCatalog(line.key, v === "__custom__" ? "" : v)}>
            <SelectTrigger className="h-8 w-40 shrink-0 text-xs">
              <SelectValue placeholder="Услуга из каталога" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__custom__">Своя услуга</SelectItem>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Название"
            value={line.name}
            onChange={(e) => update(line.key, { name: e.target.value })}
            className="h-8 min-w-0 flex-1 text-xs"
          />
          <Input
            type="number"
            step="0.01"
            placeholder="¥"
            value={line.priceCny}
            onChange={(e) => update(line.key, { priceCny: e.target.value })}
            className="h-8 w-20 shrink-0 text-xs"
          />
          <Input
            type="number"
            min={1}
            step="1"
            placeholder="Кол-во"
            value={line.quantity}
            onChange={(e) => update(line.key, { quantity: e.target.value })}
            className="h-8 w-16 shrink-0 text-xs"
          />
          <span className="shrink-0 text-xs text-text-secondary">{moneyCny(serviceLineTotalCny(line), serviceLineTotalRub(line, cnyRateRub))}</span>
          <button
            type="button"
            onClick={() => remove(line.key)}
            className="shrink-0 rounded-md p-1 text-text-secondary transition-colors hover:bg-error/10 hover:text-error"
            aria-label="Удалить услугу"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-3.5 w-3.5" /> Добавить услугу
      </Button>
    </div>
  );
}
