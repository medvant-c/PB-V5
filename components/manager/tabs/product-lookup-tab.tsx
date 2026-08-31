"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Search, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhotoPicker } from "@/components/manager/photo-picker";
import { parseLocaleNumber } from "@/lib/number";
import { DESTINATION_COUNTRIES, type DestinationCountry } from "@/lib/destination-countries";
import { cn } from "@/lib/utils";

interface WbSearchProduct {
  id: number;
  link: string;
  price: number;
  rating: number;
  feedbacks: number;
  description: string;
}

interface Item1688SearchResult {
  itemId: number;
  title: string;
  titleOrigin: string;
  imageUrl: string;
  priceCny: number;
  productUrl: string;
  moq: string;
  companyName: string | null;
}

interface Item1688PriceTier {
  beginAmount: number;
  priceCny: number;
}

interface Item1688Detail {
  itemId: number;
  title: string;
  images: string[];
  basePriceCny: number;
  priceTiers: Item1688PriceTier[];
  shopName: string | null;
  productUrl: string;
}

const QUOTE_TYPE_OPTIONS = [
  { value: "standard", label: "Стандарт" },
  { value: "expert", label: "Эксперт" },
  { value: "pro", label: "Про" },
] as const;

function pickTieredPriceCny(tiers: Item1688PriceTier[], quantity: number, fallback: number): number {
  if (tiers.length === 0) return fallback;
  const sorted = [...tiers].sort((a, b) => a.beginAmount - b.beginAmount);
  let applicable = sorted[0].priceCny;
  for (const tier of sorted) {
    if (quantity >= tier.beginAmount) applicable = tier.priceCny;
  }
  return applicable;
}

function formatRub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function ManagerProductLookupTab() {
  // --- Фото ---
  const [photos, setPhotos] = useState<File[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoStorageKey, setPhotoStorageKey] = useState<string | null>(null);
  const [photoPublicUrl, setPhotoPublicUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    const file = photos[0];
    if (!file) {
      setPhotoStorageKey(null);
      setPhotoPublicUrl(null);
      return;
    }
    setUploadingPhoto(true);
    setPhotoError(null);
    const formData = new FormData();
    formData.append("photo", file);
    fetch("/api/product-lookup/photo", { method: "POST", body: formData })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setPhotoError(data.error ?? "Не удалось загрузить фото.");
          return;
        }
        setPhotoStorageKey(data.storageKey);
        setPhotoPublicUrl(data.publicUrl);
      })
      .catch(() => setPhotoError("Не удалось связаться с сервером."))
      .finally(() => setUploadingPhoto(false));
  }, [photos]);

  // --- Товар ---
  const [productName, setProductName] = useState("");
  const [quantityStr, setQuantityStr] = useState("1");
  const quantity = Math.max(1, Math.round(parseLocaleNumber(quantityStr) || 1));

  // --- Wildberries: поиск и вес/габариты ---
  const [wbQuery, setWbQuery] = useState("");
  const [wbSearching, setWbSearching] = useState(false);
  const [wbResults, setWbResults] = useState<WbSearchProduct[]>([]);
  const [wbSelectedLink, setWbSelectedLink] = useState<string | null>(null);
  const [wbItemLoading, setWbItemLoading] = useState(false);
  const [wbMatchedFrom, setWbMatchedFrom] = useState<Record<string, string | null> | null>(null);
  const [wbError, setWbError] = useState<string | null>(null);

  const [weightKgStr, setWeightKgStr] = useState("");
  const [lengthCmStr, setLengthCmStr] = useState("");
  const [widthCmStr, setWidthCmStr] = useState("");
  const [heightCmStr, setHeightCmStr] = useState("");

  async function searchWb() {
    if (!wbQuery.trim() || wbSearching) return;
    setWbSearching(true);
    setWbError(null);
    setWbResults([]);
    try {
      const res = await fetch("/api/product-lookup/wb-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: wbQuery.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWbError(data.error ?? "Не удалось выполнить поиск.");
        return;
      }
      setWbResults(data.products ?? []);
    } catch {
      setWbError("Не удалось связаться с сервером.");
    } finally {
      setWbSearching(false);
    }
  }

  async function selectWbProduct(link: string) {
    setWbSelectedLink(link);
    setWbItemLoading(true);
    setWbError(null);
    setWbMatchedFrom(null);
    try {
      const res = await fetch("/api/product-lookup/wb-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWbError(data.error ?? "Не удалось получить карточку товара.");
        return;
      }
      const dims = data.dimensions as {
        weightKg: number | null;
        lengthCm: number | null;
        widthCm: number | null;
        heightCm: number | null;
        matchedFrom: Record<string, string | null>;
      };
      if (dims.weightKg !== null) setWeightKgStr(String(dims.weightKg));
      if (dims.lengthCm !== null) setLengthCmStr(String(dims.lengthCm));
      if (dims.widthCm !== null) setWidthCmStr(String(dims.widthCm));
      if (dims.heightCm !== null) setHeightCmStr(String(dims.heightCm));
      setWbMatchedFrom(dims.matchedFrom);
      if (!productName.trim() && data.item?.title) setProductName(data.item.title);
    } catch {
      setWbError("Не удалось связаться с сервером.");
    } finally {
      setWbItemLoading(false);
    }
  }

  // --- 1688: поиск по фото (когда заработает), по названию, вручную ---
  const [cn1688Query, setCn1688Query] = useState("");
  const [cn1688Searching, setCn1688Searching] = useState(false);
  const [cn1688Results, setCn1688Results] = useState<Item1688SearchResult[]>([]);
  const [cn1688ImageSearching, setCn1688ImageSearching] = useState(false);
  const [cn1688ItemLoading, setCn1688ItemLoading] = useState(false);
  const [cn1688Item, setCn1688Item] = useState<Item1688Detail | null>(null);
  const [cn1688ManualUrl, setCn1688ManualUrl] = useState("");
  const [cn1688Error, setCn1688Error] = useState<string | null>(null);

  const [priceCnyPerUnitStr, setPriceCnyPerUnitStr] = useState("");

  useEffect(() => {
    if (cn1688Item) {
      setPriceCnyPerUnitStr(String(pickTieredPriceCny(cn1688Item.priceTiers, quantity, cn1688Item.basePriceCny)));
    }
  }, [cn1688Item, quantity]);

  async function search1688ByImage() {
    if (!photoPublicUrl || cn1688ImageSearching) return;
    setCn1688ImageSearching(true);
    setCn1688Error(null);
    setCn1688Results([]);
    try {
      const res = await fetch("/api/product-lookup/1688-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicUrl: photoPublicUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCn1688Error(data.error ?? "Не удалось выполнить поиск по фото.");
        return;
      }
      setCn1688Results(data.items ?? []);
    } catch {
      setCn1688Error("Не удалось связаться с сервером.");
    } finally {
      setCn1688ImageSearching(false);
    }
  }

  async function search1688ByKeyword() {
    if (!cn1688Query.trim() || cn1688Searching) return;
    setCn1688Searching(true);
    setCn1688Error(null);
    setCn1688Results([]);
    try {
      const res = await fetch("/api/product-lookup/1688-search-keyword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: cn1688Query.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCn1688Error(data.error ?? "Не удалось выполнить поиск.");
        return;
      }
      setCn1688Results(data.items ?? []);
    } catch {
      setCn1688Error("Не удалось связаться с сервером.");
    } finally {
      setCn1688Searching(false);
    }
  }

  async function select1688Item(url: string) {
    setCn1688ItemLoading(true);
    setCn1688Error(null);
    try {
      const res = await fetch("/api/product-lookup/1688-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCn1688Error(data.error ?? "Не удалось получить карточку товара.");
        return;
      }
      setCn1688Item(data.item);
    } catch {
      setCn1688Error("Не удалось связаться с сервером.");
    } finally {
      setCn1688ItemLoading(false);
    }
  }

  // --- Параметры доставки/расчёта ---
  const [destinationCountry, setDestinationCountry] = useState<DestinationCountry>("russia");
  const [quoteType, setQuoteType] = useState<"standard" | "expert" | "pro">("standard");
  const [deliveryPricingMode, setDeliveryPricingMode] = useState<"density" | "volume">("density");
  const [cargoCategoryKey, setCargoCategoryKey] = useState("");
  const [chinaDeliveryCnyStr, setChinaDeliveryCnyStr] = useState("0");

  const [densityTiers, setDensityTiers] = useState<{ categoryKey: string; categoryLabel: string }[]>([]);
  const [volumeTariffs, setVolumeTariffs] = useState<{ categoryKey: string; categoryLabel: string }[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/manager-density-tariffs?country=${destinationCountry}`).then((r) => r.json()),
      fetch(`/api/manager-volume-tariffs?country=${destinationCountry}`).then((r) => r.json()),
    ]).then(([densityData, volumeData]) => {
      setDensityTiers(densityData.tiers ?? []);
      setVolumeTariffs(volumeData.tariffs ?? []);
    });
  }, [destinationCountry]);

  const densityCategories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of densityTiers) seen.set(t.categoryKey, t.categoryLabel);
    return Array.from(seen.entries());
  }, [densityTiers]);
  const volumeCategories = useMemo(
    () => volumeTariffs.map((t): [string, string] => [t.categoryKey, t.categoryLabel]),
    [volumeTariffs],
  );
  const categories = deliveryPricingMode === "density" ? densityCategories : volumeCategories;

  useEffect(() => {
    if (categories.length === 0) return;
    if (!categories.some(([key]) => key === cargoCategoryKey)) setCargoCategoryKey(categories[0][0]);
  }, [categories, cargoCategoryKey]);

  // --- Превью расчёта ---
  const [preview, setPreview] = useState<{
    computed: {
      totalPriceRub: number;
      chinaDeliveryRub: number;
      cargoDeliveryRub: number;
      buyoutCommissionRub: number;
      totalWeightKg: number;
      totalVolumeM3: number;
      densityKgM3: number;
      totalRub: number;
    };
    searchServiceFeeRub: number;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const weightKg = parseLocaleNumber(weightKgStr) || 0;
  const lengthCm = parseLocaleNumber(lengthCmStr) || 0;
  const widthCm = parseLocaleNumber(widthCmStr) || 0;
  const heightCm = parseLocaleNumber(heightCmStr) || 0;
  const priceCnyPerUnit = parseLocaleNumber(priceCnyPerUnitStr) || 0;
  const chinaDeliveryCny = parseLocaleNumber(chinaDeliveryCnyStr) || 0;

  const calcInput = useMemo(
    () => ({
      destinationCountry,
      quoteType,
      cargoCategoryKey,
      deliveryPricingMode,
      quantity,
      priceCnyPerUnit,
      chinaDeliveryCny,
      weightPerUnitKg: weightKg,
      unitLengthCm: lengthCm,
      unitWidthCm: widthCm,
      unitHeightCm: heightCm,
    }),
    [destinationCountry, quoteType, cargoCategoryKey, deliveryPricingMode, quantity, priceCnyPerUnit, chinaDeliveryCny, weightKg, lengthCm, widthCm, heightCm],
  );

  const canCalculate = cargoCategoryKey && weightKg > 0 && lengthCm > 0 && widthCm > 0 && heightCm > 0 && priceCnyPerUnit > 0;

  useEffect(() => {
    if (!canCalculate) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      setPreviewError(null);
      fetch("/api/product-lookup/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(calcInput),
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            setPreviewError(data.error ?? "Не удалось посчитать.");
            setPreview(null);
            return;
          }
          setPreview(data);
        })
        .catch(() => setPreviewError("Не удалось связаться с сервером."))
        .finally(() => setPreviewLoading(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [calcInput, canCalculate]);

  // --- Экспорт PDF ---
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const exportPdf = useCallback(async () => {
    if (!canCalculate || !productName.trim() || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/product-lookup/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...calcInput, productName: productName.trim(), photoStorageKey }),
      });
      if (!res.ok) {
        const data = await res.json();
        setExportError(data.error ?? "Не удалось сформировать файл.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${productName.trim() || "avtopoisk"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Не удалось связаться с сервером.");
    } finally {
      setExporting(false);
    }
  }, [canCalculate, productName, exporting, calcInput, photoStorageKey]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-1 text-sm font-bold text-text">1. Фото и название товара</h2>
        <p className="mb-3 text-xs text-text-secondary">
          Фото используется в итоговом файле и (когда заработает поиск по изображению на 1688) для поиска аналога у поставщика.
        </p>
        <div className="space-y-3">
          <PhotoPicker photos={photos} onChange={setPhotos} maxPhotos={1} />
          {uploadingPhoto && (
            <p className="flex items-center gap-1.5 text-xs text-text-secondary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Загрузка фото…
            </p>
          )}
          {photoError && <p className="text-xs text-error">{photoError}</p>}
          <Input placeholder="Название товара (для файла)" value={productName} onChange={(e) => setProductName(e.target.value)} />
          <div className="w-32">
            <label className="mb-1 block text-xs font-medium text-text-secondary">Количество, шт</label>
            <Input value={quantityStr} onChange={(e) => setQuantityStr(e.target.value)} inputMode="numeric" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-1 text-sm font-bold text-text">2. Wildberries — вес и габариты упаковки</h2>
        <p className="mb-3 text-xs text-text-secondary">
          Поиск по названию (поиск по фото на Wildberries недоступен в принципе). Вес/габариты определяются автоматически по
          характеристикам товара — не всегда есть, тогда впишите вручную.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Название товара на Wildberries…"
            value={wbQuery}
            onChange={(e) => setWbQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchWb()}
          />
          <Button type="button" onClick={searchWb} disabled={wbSearching || !wbQuery.trim()}>
            {wbSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        {wbError && <p className="mt-2 text-xs text-error">{wbError}</p>}
        {wbResults.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {wbResults.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectWbProduct(p.link)}
                className={cn(
                  "rounded-lg border p-2 text-left text-xs transition-colors",
                  wbSelectedLink === p.link ? "border-primary bg-primary/5" : "border-border hover:bg-bg",
                )}
              >
                <div className="line-clamp-2 font-medium text-text">{p.description}</div>
                <div className="mt-1 text-text-secondary">{Math.round(p.price).toLocaleString("ru-RU")} ₽ · ★{p.rating}</div>
              </button>
            ))}
          </div>
        )}
        {wbItemLoading && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-text-secondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Получаю характеристики…
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Вес с упак., кг</label>
            <Input value={weightKgStr} onChange={(e) => setWeightKgStr(e.target.value)} inputMode="decimal" />
            {!wbMatchedFrom?.weight && weightKgStr === "" && <p className="mt-0.5 text-[10px] text-warning">не найдено, впишите вручную</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Длина, см</label>
            <Input value={lengthCmStr} onChange={(e) => setLengthCmStr(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Ширина, см</label>
            <Input value={widthCmStr} onChange={(e) => setWidthCmStr(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Высота, см</label>
            <Input value={heightCmStr} onChange={(e) => setHeightCmStr(e.target.value)} inputMode="decimal" />
          </div>
        </div>
        {wbMatchedFrom && (
          <p className="mt-2 text-[10px] text-text-secondary">
            Распознано из характеристик WB — сверьте с карточкой товара:{" "}
            {[wbMatchedFrom.weight, wbMatchedFrom.length, wbMatchedFrom.width, wbMatchedFrom.height].filter(Boolean).join(" · ") || "ничего не найдено"}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-1 text-sm font-bold text-text">3. 1688 — закупочная цена</h2>
        <div className="mb-3 flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs text-text">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          Поиск по фото на 1688 сейчас недоступен (сбой на стороне сервиса-поставщика) — используйте поиск по названию или вставьте
          ссылку на товар вручную.
        </div>
        <Button type="button" size="sm" variant="outline" onClick={search1688ByImage} disabled={!photoPublicUrl || cn1688ImageSearching}>
          {cn1688ImageSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Найти по фото
        </Button>
        <div className="mt-2 flex gap-2">
          <Input
            placeholder="Название товара на 1688 (на английском лучше находит)…"
            value={cn1688Query}
            onChange={(e) => setCn1688Query(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search1688ByKeyword()}
          />
          <Button type="button" onClick={search1688ByKeyword} disabled={cn1688Searching || !cn1688Query.trim()}>
            {cn1688Searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        <div className="mt-2 flex gap-2">
          <Input placeholder="…или вставьте ссылку на detail.1688.com вручную" value={cn1688ManualUrl} onChange={(e) => setCn1688ManualUrl(e.target.value)} />
          <Button type="button" variant="outline" onClick={() => select1688Item(cn1688ManualUrl.trim())} disabled={!cn1688ManualUrl.trim() || cn1688ItemLoading}>
            Открыть
          </Button>
        </div>
        {cn1688Error && <p className="mt-2 text-xs text-error">{cn1688Error}</p>}
        {cn1688Results.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {cn1688Results.map((item) => (
              <button
                key={item.itemId}
                type="button"
                onClick={() => select1688Item(item.productUrl)}
                className="rounded-lg border border-border p-2 text-left text-xs transition-colors hover:bg-bg"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- внешняя картинка с CDN 1688, не наш storage */}
                <img src={item.imageUrl} alt="" className="mb-1 h-16 w-full rounded object-cover" />
                <div className="line-clamp-2 font-medium text-text">{item.title || item.titleOrigin}</div>
                <div className="mt-1 text-text-secondary">
                  ¥{item.priceCny} {item.companyName && `· ${item.companyName}`}
                </div>
              </button>
            ))}
          </div>
        )}
        {cn1688ItemLoading && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-text-secondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Получаю карточку товара…
          </p>
        )}
        {cn1688Item && (
          <p className="mt-2 text-[10px] text-text-secondary">
            {cn1688Item.title} — цена по объёму {quantity} шт подставлена автоматически (ступени:{" "}
            {cn1688Item.priceTiers.map((t) => `от ${t.beginAmount}: ¥${t.priceCny}`).join(", ") || "нет данных"})
          </p>
        )}
        <div className="mt-3 w-40">
          <label className="mb-1 block text-xs font-medium text-text-secondary">Цена за шт, ¥</label>
          <Input value={priceCnyPerUnitStr} onChange={(e) => setPriceCnyPerUnitStr(e.target.value)} inputMode="decimal" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-bold text-text">4. Доставка и итог</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Страна</label>
            <Select value={destinationCountry} onValueChange={(v) => setDestinationCountry(v as DestinationCountry)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DESTINATION_COUNTRIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Тариф услуги поиска</label>
            <Select value={quoteType} onValueChange={(v) => setQuoteType(v as "standard" | "expert" | "pro")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUOTE_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Расчёт карго</label>
            <Select value={deliveryPricingMode} onValueChange={(v) => setDeliveryPricingMode(v as "density" | "volume")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="density">По плотности</SelectItem>
                <SelectItem value="volume">По объёму</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Категория груза</label>
            <Select value={cargoCategoryKey} onValueChange={setCargoCategoryKey}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Категория" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3 w-40">
          <label className="mb-1 block text-xs font-medium text-text-secondary">Доставка по Китаю, ¥</label>
          <Input value={chinaDeliveryCnyStr} onChange={(e) => setChinaDeliveryCnyStr(e.target.value)} inputMode="decimal" />
        </div>

        {previewError && <p className="mt-3 text-xs text-error">{previewError}</p>}
        {!canCalculate && (
          <p className="mt-3 text-xs text-text-secondary">Заполните вес, габариты и цену выше, чтобы увидеть расчёт.</p>
        )}
        {previewLoading && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-text-secondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Считаю…
          </p>
        )}
        {preview && !previewLoading && (
          <div className="mt-4 space-y-1.5 rounded-lg border border-border bg-bg p-3 text-sm">
            <div className="flex justify-between text-text-secondary">
              <span>Товар ({quantity} шт)</span>
              <span>{formatRub(preview.computed.totalPriceRub)}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>Доставка по Китаю</span>
              <span>{formatRub(preview.computed.chinaDeliveryRub)}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>Услуга поиска</span>
              <span>{formatRub(preview.searchServiceFeeRub)}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>Организация выкупа</span>
              <span>{formatRub(preview.computed.buyoutCommissionRub)}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>
                Карго ({preview.computed.densityKgM3.toFixed(0)} кг/м³, {preview.computed.totalWeightKg.toFixed(1)} кг /{" "}
                {preview.computed.totalVolumeM3.toFixed(3)} м³)
              </span>
              <span>{formatRub(preview.computed.cargoDeliveryRub)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold text-text">
              <span>Итого</span>
              <span>{formatRub(preview.computed.totalRub)}</span>
            </div>
          </div>
        )}

        {exportError && <p className="mt-3 text-xs text-error">{exportError}</p>}
        <Button type="button" className="mt-4 w-full" onClick={exportPdf} disabled={!canCalculate || !productName.trim() || exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Скачать PDF
        </Button>
      </div>
    </div>
  );
}

export { ManagerProductLookupTab };
