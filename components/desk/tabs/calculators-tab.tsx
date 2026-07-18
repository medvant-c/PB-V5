"use client";

import { useState } from "react";
import { DeskFileTab } from "@/generated/prisma/enums";
import { FileUploadPanel } from "@/components/desk/file-upload-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Fixed demo rate — ported from the reference desk mockup. Swap for a live
// feed (CBR or bank API) before relying on this for real client-facing quotes.
const CNY_RATE = 12.6;
const VAT_RATE = 0.2;

function fmt(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

// Flagged directly on the result it applies to (not just in footer copy)
// so it's impossible to read the number without also seeing that it's
// unverified — the caveat has to travel with the figure a manager might
// repeat to a client, not sit below five calculators' worth of numbers.
function DemoBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-warning">
      ДЕМО
    </span>
  );
}

// Density (объёмный вес) tiers — market-typical cargo rates from China, not
// Panda Bridge's confirmed internal tariff. Grounded in published reference
// points (chinatoday.ru: ~200 kg/m³ → $3/kg, ~70 kg/m³ → $6.3/kg, cheapest
// from ~400 kg/m³ at ~$2/kg); the brackets in between are interpolated.
// Replace with real tariffs once available — same caveat as the CNY rate above.
const DENSITY_TIERS: { maxDensity: number; rate: number }[] = [
  { maxDensity: 75, rate: 6.3 },
  { maxDensity: 150, rate: 5 },
  { maxDensity: 200, rate: 4 },
  { maxDensity: 300, rate: 3 },
  { maxDensity: 400, rate: 2.5 },
  { maxDensity: Infinity, rate: 2 },
];

function rateForDensity(density: number): number {
  const tier = DENSITY_TIERS.find((t) => density <= t.maxDensity);
  return tier ? tier.rate : DENSITY_TIERS[DENSITY_TIERS.length - 1].rate;
}

// Category coefficients are indicative market averages (customs complexity,
// fragility, certification risk) — not a confirmed Panda Bridge rate card.
// Uточните точные коэффициенты у руководства before quoting a client.
const CARGO_CATEGORIES: { id: string; label: string; multiplier: number }[] = [
  { id: "standard", label: "Стандартный товар", multiplier: 1 },
  { id: "clothing", label: "Одежда / текстиль", multiplier: 1 },
  { id: "electronics", label: "Электроника / техника", multiplier: 1.15 },
  { id: "fragile", label: "Хрупкое (стекло, керамика)", multiplier: 1.25 },
  { id: "furniture", label: "Мебель / крупногабарит", multiplier: 1.1 },
  { id: "kids", label: "Детские товары / игрушки", multiplier: 1.05 },
  { id: "branded", label: "Брендовые товары / реплики", multiplier: 1.3 },
];

// One calculator visible at a time — showing all five simultaneously meant a
// manager solving one task (e.g. quoting a single cargo shipment) also had
// to visually filter out four unrelated tools sharing the same screen.
const CALCULATOR_TABS = [
  { id: "cny", label: "Валюта CNY → RUB" },
  { id: "duty", label: "Таможенная пошлина" },
  { id: "cbm", label: "Доставка за куб" },
  { id: "margin", label: "Маржа сделки" },
  { id: "cargo", label: "Карго по плотности" },
] as const;

type CalculatorId = (typeof CALCULATOR_TABS)[number]["id"];

function CalculatorsTab() {
  const [activeCalc, setActiveCalc] = useState<CalculatorId>("cny");

  const [cnyAmount, setCnyAmount] = useState(1000);
  const [costValue, setCostValue] = useState(5000);
  const [dutyRate, setDutyRate] = useState(10);
  const [cbmCount, setCbmCount] = useState(12);
  const [cbmRate, setCbmRate] = useState(85);
  const [marginCost, setMarginCost] = useState(4000);
  const [marginPrice, setMarginPrice] = useState(5000);
  const [cargoWeight, setCargoWeight] = useState(100);
  const [cargoLength, setCargoLength] = useState(50);
  const [cargoWidth, setCargoWidth] = useState(40);
  const [cargoHeight, setCargoHeight] = useState(40);
  const [cargoCategory, setCargoCategory] = useState(CARGO_CATEGORIES[0].id);
  const [dealName, setDealName] = useState("");

  const cnyResult = cnyAmount * CNY_RATE;

  const duty = costValue * (dutyRate / 100);
  const vat = (costValue + duty) * VAT_RATE;
  const dutyResult = duty + vat;

  const cbmResult = cbmCount * cbmRate;

  const marginResult = marginPrice > 0 ? ((marginPrice - marginCost) / marginPrice) * 100 : 0;

  const cargoVolumeM3 = (cargoLength * cargoWidth * cargoHeight) / 1_000_000;
  const cargoDensity = cargoVolumeM3 > 0 ? cargoWeight / cargoVolumeM3 : 0;
  const cargoCategoryMultiplier = CARGO_CATEGORIES.find((c) => c.id === cargoCategory)?.multiplier ?? 1;
  const cargoBaseRate = cargoDensity > 0 ? rateForDensity(cargoDensity) : 0;
  const cargoEffectiveRate = cargoBaseRate * cargoCategoryMultiplier;
  const cargoResult = cargoWeight * cargoEffectiveRate;

  const trimmedDeal = dealName.trim();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {CALCULATOR_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveCalc(tab.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              activeCalc === tab.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface text-text-secondary hover:text-text",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeCalc === "cny" && (
        <div className="max-w-md rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-text">Конвертер CNY — RUB</h3>
            <DemoBadge />
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            Демо-курс: 1 CNY = {CNY_RATE} RUB. Замените на актуальный курс ЦБ или банка.
          </p>
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="cny-amount">Сумма, CNY</Label>
            <Input
              id="cny-amount"
              type="number"
              min={0}
              value={cnyAmount}
              onChange={(event) => setCnyAmount(Number(event.target.value) || 0)}
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-text">
            <span>
              ≈ <strong className="text-base text-primary">{fmt(cnyResult)}</strong> ₽
            </span>
            <DemoBadge />
          </div>
        </div>
      )}

      {activeCalc === "duty" && (
        <div className="max-w-md rounded-xl border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold text-text">Таможенная пошлина (упрощённо)</h3>
          <p className="mt-1 text-xs text-text-secondary">
            Приблизительный расчёт: пошлина + НДС от стоимости товара. Для точного расчёта используйте актуальные
            ставки ТН ВЭД.
          </p>
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cost-value">Стоимость товара, $</Label>
              <Input
                id="cost-value"
                type="number"
                min={0}
                value={costValue}
                onChange={(event) => setCostValue(Number(event.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="duty-rate">Ставка пошлины, %</Label>
              <Input
                id="duty-rate"
                type="number"
                min={0}
                value={dutyRate}
                onChange={(event) => setDutyRate(Number(event.target.value) || 0)}
              />
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-border bg-bg p-3 text-sm text-text">
            Пошлина + НДС — <strong className="text-base text-primary">${fmt(dutyResult)}</strong>
          </div>
        </div>
      )}

      {activeCalc === "cbm" && (
        <div className="max-w-md rounded-xl border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold text-text">Стоимость доставки за куб</h3>
          <p className="mt-1 text-xs text-text-secondary">Оценка стоимости морской доставки по объёму груза.</p>
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cbm-count">Объём, м³</Label>
              <Input
                id="cbm-count"
                type="number"
                min={0}
                value={cbmCount}
                onChange={(event) => setCbmCount(Number(event.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cbm-rate">Ставка за м³, $</Label>
              <Input
                id="cbm-rate"
                type="number"
                min={0}
                value={cbmRate}
                onChange={(event) => setCbmRate(Number(event.target.value) || 0)}
              />
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-border bg-bg p-3 text-sm text-text">
            Итого — <strong className="text-base text-primary">${fmt(cbmResult)}</strong>
          </div>
        </div>
      )}

      {activeCalc === "margin" && (
        <div className="max-w-md rounded-xl border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold text-text">Маржа сделки</h3>
          <p className="mt-1 text-xs text-text-secondary">Расчёт наценки менеджера по сделке.</p>
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="margin-cost">Себестоимость, $</Label>
              <Input
                id="margin-cost"
                type="number"
                min={0}
                value={marginCost}
                onChange={(event) => setMarginCost(Number(event.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="margin-price">Цена для клиента, $</Label>
              <Input
                id="margin-price"
                type="number"
                min={0}
                value={marginPrice}
                onChange={(event) => setMarginPrice(Number(event.target.value) || 0)}
              />
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-border bg-bg p-3 text-sm text-text">
            Маржа — <strong className="text-base text-primary">{Math.round(marginResult)}%</strong>
          </div>
        </div>
      )}

      {activeCalc === "cargo" && (
        <div className="max-w-2xl rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-text">Доставка карго — по весу и плотности</h3>
            <DemoBadge />
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            Плотность считается по формуле вес ÷ объём (объём — из габаритов). Ставка за кг зависит от плотности:
            чем плотнее груз, тем дешевле тариф. Коэффициент категории — ориентировочный рыночный, не подтверждённый
            тариф компании — уточните точные цифры у руководства перед тем как называть цену клиенту.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cargo-weight">Вес, кг</Label>
              <Input
                id="cargo-weight"
                type="number"
                min={0}
                value={cargoWeight}
                onChange={(event) => setCargoWeight(Number(event.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cargo-category">Категория товара</Label>
              <Select value={cargoCategory} onValueChange={setCargoCategory}>
                <SelectTrigger id="cargo-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARGO_CATEGORIES.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cargo-length">Длина, см</Label>
              <Input
                id="cargo-length"
                type="number"
                min={0}
                value={cargoLength}
                onChange={(event) => setCargoLength(Number(event.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cargo-width">Ширина, см</Label>
              <Input
                id="cargo-width"
                type="number"
                min={0}
                value={cargoWidth}
                onChange={(event) => setCargoWidth(Number(event.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cargo-height">Высота, см</Label>
              <Input
                id="cargo-height"
                type="number"
                min={0}
                value={cargoHeight}
                onChange={(event) => setCargoHeight(Number(event.target.value) || 0)}
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-bg p-2.5 text-xs">
              <div className="text-text-secondary">Объём</div>
              <div className="mt-0.5 font-semibold text-text">{cargoVolumeM3.toFixed(3)} м³</div>
            </div>
            <div className="rounded-lg border border-border bg-bg p-2.5 text-xs">
              <div className="text-text-secondary">Плотность</div>
              <div className="mt-0.5 font-semibold text-text">{fmt(cargoDensity)} кг/м³</div>
            </div>
            <div className="rounded-lg border border-border bg-bg p-2.5 text-xs">
              <div className="text-text-secondary">Ставка за кг</div>
              <div className="mt-0.5 font-semibold text-text">${cargoEffectiveRate.toFixed(2)}</div>
            </div>
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-xs">
              <div className="flex items-center justify-between gap-1 text-text-secondary">
                Итого <DemoBadge />
              </div>
              <div className="mt-0.5 font-semibold text-primary">${fmt(cargoResult)}</div>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-border pt-4">
        <div className="max-w-sm space-y-1.5">
          <Label htmlFor="deal-name">Сохранить к сделке — название сделки / клиента</Label>
          <Input
            id="deal-name"
            value={dealName}
            onChange={(event) => setDealName(event.target.value)}
            placeholder="Например: Иванов — термосы 500мл"
          />
        </div>
        {trimmedDeal && (
          <div className="mt-3">
            <FileUploadPanel tab={DeskFileTab.calculators} relatedId={trimmedDeal} />
          </div>
        )}
      </div>
    </div>
  );
}

export { CalculatorsTab };
