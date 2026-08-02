"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Info, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PhotoPicker } from "@/components/manager/photo-picker";
import {
  computeQuote,
  computeQuoteWithAutoCnyTier,
  type CnyRateTiers,
  type DensityTierInput,
  type VolumeTierInput,
  type BuyoutCommissionTierInput,
  type DeliveryPricingMode,
  type VolumeInputMode,
} from "@/lib/quote-engine";
import { SEARCH_TIER_INFO } from "@/lib/desk-services/search-tier-info";
import { cargoCategoryHint } from "@/lib/desk-services/cargo-category-hints";
import { parseLocaleNumber } from "@/lib/number";
import { cn } from "@/lib/utils";
import { DESTINATION_COUNTRIES, type DestinationCountry } from "@/lib/destination-countries";

interface TariffSettingsRecord {
  cnyRateRub: string;
  cnyRateRubTier3000: string | null;
  cnyRateRubTier10000: string | null;
  cnyRateRubTier30000: string | null;
  usdRateRub: string;
  volumeRateUsdPerCbm: string;
  standardPriceRub: string;
  expertPriceRub: string;
  proPriceRub: string;
  customProductionStandardRub: string;
  customProductionExpertRub: string;
  customProductionProRub: string;
}

interface DensityTierRecord {
  categoryKey: string;
  categoryLabel: string;
  minDensity: string;
  maxDensity: string | null;
  ratePerKgUsd: string;
}

interface VolumeTariffRecord {
  categoryKey: string;
  categoryLabel: string;
  rateUsdPerCbm: string;
}

interface BuyoutCommissionTariffRecord {
  minAmountRub: string;
  maxAmountRub: string | null;
  commissionPercent: string;
}

interface ExistingPhoto {
  id: string;
  originalName: string;
}

interface ServiceCatalogItemRecord {
  id: string;
  direction: string;
  name: string;
  price: string;
}

interface AttachedServiceState {
  serviceCatalogItemId?: string;
  name: string;
  priceRub: string;
}

const DIRECTION_LABEL: Record<string, string> = {
  start: "Старт",
  business: "Бизнес",
  factory: "Производство",
  logistics: "Логистика",
  fulfillment: "Фулфилмент",
  ai: "AI",
  academy: "Обучение",
};

// Only these four directions are relevant to attach onto a quote — the full
// price list also has logistics/AI/academy services, but those aren't
// things a manager tacks onto a cargo quote for a client.
const ATTACHABLE_DIRECTIONS = ["fulfillment", "factory", "start", "business"];

// The catalog's own price field is free text ("от 10 000 ₽/ед.", "3
// бесплатно, далее 1 000 ₽") — not always a clean number. This just prefills
// a starting point (the number right before "₽") for the manager to
// confirm or correct; it is never trusted as-is.
function guessPriceRub(priceText: string): string {
  const match = priceText.match(/([\d\s]+)\s*₽/);
  return match ? match[1].replace(/\s/g, "") : "";
}

interface QuoteDetail {
  destinationCountry: DestinationCountry;
  quoteType: "standard" | "expert" | "pro";
  productName: string;
  productLink: string | null;
  productDescription: string | null;
  color: string | null;
  dimensions: string | null;
  quantity: number;
  priceCnyPerUnit: string;
  chinaDeliveryCny: string;
  weightPerUnitKg: string;
  volumeInputMode: VolumeInputMode;
  unitLengthCm: string | null;
  unitWidthCm: string | null;
  unitHeightCm: string | null;
  totalLengthCm: string | null;
  totalWidthCm: string | null;
  totalHeightCm: string | null;
  unitVolumeM3: string | null;
  totalVolumeM3: string;
  deliveryPricingMode: DeliveryPricingMode;
  cargoCategoryKey: string | null;
  cargoDiscountUsd: string;
  cargoRateUsd: string;
  cargoRateUsdOverride: string | null;
  cargoRateOverrideConfirmed: boolean;
  cnyRateUsed: string;
  cnyRateRubOverride: string | null;
  cnyRateOverrideConfirmed: boolean;
  usdRateUsed: string;
  usdRateRubOverride: string | null;
  usdRateOverrideConfirmed: boolean;
  buyoutCommissionPercent: string;
  buyoutCommissionPercentOverride: string | null;
  buyoutCommissionOverrideConfirmed: boolean;
  searchFeeWaived: boolean;
  isCustomProduction: boolean;
}

interface QuoteDialogProps {
  client: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  // When set, the dialog loads that quote and edits it (PATCH) instead of
  // creating a new one (POST).
  editingQuoteId?: string | null;
}

const QUOTE_TYPES = [
  { value: "standard", label: "Standart" },
  { value: "expert", label: "Expert" },
  { value: "pro", label: "Pro" },
] as const;

// Tier → the TariffSettings field backing its "производство под заказ" fee
// — a plain lookup instead of building the key string at each call site.
const CUSTOM_PRODUCTION_FIELD_BY_TYPE: Record<(typeof QUOTE_TYPES)[number]["value"], (t: TariffSettingsRecord) => string> = {
  standard: (t) => t.customProductionStandardRub,
  expert: (t) => t.customProductionExpertRub,
  pro: (t) => t.customProductionProRub,
};

function fmt(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("ru-RU") : "—";
}

const BLANK_FORM = {
  destinationCountry: "russia" as DestinationCountry,
  quoteType: "standard" as "standard" | "expert" | "pro",
  isCustomProduction: false,
  productName: "",
  productLink: "",
  productDescription: "",
  color: "",
  dimensions: "",
  quantity: "1",
  priceCnyPerUnit: "",
  chinaDeliveryCny: "0",
  weightPerUnitKg: "",
  volumeInputMode: "per_unit_dims" as VolumeInputMode,
  unitLengthCm: "",
  unitWidthCm: "",
  unitHeightCm: "",
  totalLengthCm: "",
  totalWidthCm: "",
  totalHeightCm: "",
  manualTotalVolumeM3: "",
  unitVolumeM3: "",
  deliveryPricingMode: "density" as DeliveryPricingMode,
  cargoCategoryKey: "",
  cargoDiscountUsd: "",
  cargoRateUsdOverride: "",
  cnyRateRubOverride: "",
  usdRateRubOverride: "",
  buyoutCommissionPercentOverride: "",
};

function QuoteDialog({ client, open, onOpenChange, onSaved, editingQuoteId }: QuoteDialogProps) {
  const isEditing = Boolean(editingQuoteId);

  const [tariffs, setTariffs] = useState<TariffSettingsRecord | null>(null);
  const [tiers, setTiers] = useState<DensityTierRecord[]>([]);
  const [volumeTariffs, setVolumeTariffs] = useState<VolumeTariffRecord[]>([]);
  const [buyoutCommissionTariffs, setBuyoutCommissionTariffs] = useState<BuyoutCommissionTariffRecord[]>([]);
  // Owner-editable from Настройки (see SystemSettings in
  // prisma/schema.prisma) — only the one field this dialog's live preview
  // actually needs.
  const [lowDensityVolumeThresholdKgM3, setLowDensityVolumeThresholdKgM3] = useState(100);
  const [loadingTariffs, setLoadingTariffs] = useState(true);
  const [loadingQuote, setLoadingQuote] = useState(false);
  // Frozen at quote creation, re-derived by the server on every PATCH the
  // exact same way (see app/api/manager-quotes/[id]/route.ts) — FX rates
  // and buyout % never move for an already-issued quote. Cargo rate itself
  // is always a live category lookup (density and volume both), not frozen
  // — same as the server. Without mirroring the FX/buyout%/fee freeze here,
  // this dialog's live preview would recompute with *today's* tariffs while
  // editing and show a total that doesn't match what's actually saved (and
  // what the quotes list already displays).
  const [frozenRates, setFrozenRates] = useState<{
    cnyRateRub: number;
    usdRateRub: number;
    buyoutCommissionPercent: number;
    searchFeeWaived: boolean;
  } | null>(null);

  // First field in the form — decides which country's DensityTariff/
  // VolumeTariff rows are even eligible below (see the tariff-loading
  // effect). See PB-V5 chat 2026-08-02.
  const [destinationCountry, setDestinationCountry] = useState<DestinationCountry>(BLANK_FORM.destinationCountry);
  const [quoteType, setQuoteType] = useState(BLANK_FORM.quoteType);
  const [isCustomProduction, setIsCustomProduction] = useState(BLANK_FORM.isCustomProduction);
  const [photos, setPhotos] = useState<File[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<ExistingPhoto[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [productName, setProductName] = useState(BLANK_FORM.productName);
  const [productLink, setProductLink] = useState(BLANK_FORM.productLink);
  const [productDescription, setProductDescription] = useState(BLANK_FORM.productDescription);
  const [color, setColor] = useState(BLANK_FORM.color);
  const [dimensions, setDimensions] = useState(BLANK_FORM.dimensions);
  const [quantity, setQuantity] = useState(BLANK_FORM.quantity);
  const [priceCnyPerUnit, setPriceCnyPerUnit] = useState(BLANK_FORM.priceCnyPerUnit);
  const [chinaDeliveryCny, setChinaDeliveryCny] = useState(BLANK_FORM.chinaDeliveryCny);
  const [weightPerUnitKg, setWeightPerUnitKg] = useState(BLANK_FORM.weightPerUnitKg);

  const [volumeInputMode, setVolumeInputMode] = useState(BLANK_FORM.volumeInputMode);
  const [unitLengthCm, setUnitLengthCm] = useState(BLANK_FORM.unitLengthCm);
  const [unitWidthCm, setUnitWidthCm] = useState(BLANK_FORM.unitWidthCm);
  const [unitHeightCm, setUnitHeightCm] = useState(BLANK_FORM.unitHeightCm);
  const [totalLengthCm, setTotalLengthCm] = useState(BLANK_FORM.totalLengthCm);
  const [totalWidthCm, setTotalWidthCm] = useState(BLANK_FORM.totalWidthCm);
  const [totalHeightCm, setTotalHeightCm] = useState(BLANK_FORM.totalHeightCm);
  const [manualTotalVolumeM3, setManualTotalVolumeM3] = useState(BLANK_FORM.manualTotalVolumeM3);
  const [unitVolumeM3, setUnitVolumeM3] = useState(BLANK_FORM.unitVolumeM3);

  const [deliveryPricingMode, setDeliveryPricingMode] = useState(BLANK_FORM.deliveryPricingMode);
  const [cargoCategoryKey, setCargoCategoryKey] = useState(BLANK_FORM.cargoCategoryKey);
  const [cargoDiscountUsd, setCargoDiscountUsd] = useState(BLANK_FORM.cargoDiscountUsd);
  const [cargoRateUsdOverride, setCargoRateUsdOverride] = useState(BLANK_FORM.cargoRateUsdOverride);
  // Read-only info once a manual rate has been approved (see Quote.
  // cargoRateOverrideConfirmed) — the manager can still change the rate
  // itself (that resets confirmation server-side), just can't be the one
  // who marks it confirmed. Only meaningful while editing.
  const [cargoRateOverrideConfirmed, setCargoRateOverrideConfirmed] = useState(false);
  const [cnyRateRubOverride, setCnyRateRubOverride] = useState(BLANK_FORM.cnyRateRubOverride);
  const [cnyRateOverrideConfirmed, setCnyRateOverrideConfirmed] = useState(false);
  const [usdRateRubOverride, setUsdRateRubOverride] = useState(BLANK_FORM.usdRateRubOverride);
  const [usdRateOverrideConfirmed, setUsdRateOverrideConfirmed] = useState(false);
  const [buyoutCommissionPercentOverride, setBuyoutCommissionPercentOverride] = useState(BLANK_FORM.buyoutCommissionPercentOverride);
  const [buyoutCommissionOverrideConfirmed, setBuyoutCommissionOverrideConfirmed] = useState(false);

  const [catalog, setCatalog] = useState<ServiceCatalogItemRecord[]>([]);
  const [attachedServices, setAttachedServices] = useState<AttachedServiceState[]>([]);
  // Collapsed by default — the price-list checklist was pushing the total
  // preview and submit buttons far down a form that's already long. Opens
  // automatically when editing a quote that already has services attached,
  // so nothing already selected is hidden from view. See PB-V5 chat
  // 2026-07-30.
  const [servicesOpen, setServicesOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingTariffs(true);
    Promise.all([
      fetch("/api/manager-tariffs").then((res) => res.json()),
      fetch("/api/manager-buyout-commission-tariffs").then((res) => res.json()),
      fetch("/api/manager-service-catalog").then((res) => res.json()),
      fetch("/api/manager-settings").then((res) => res.json()),
    ])
      .then(([settingsData, buyoutCommissionTariffsData, catalogData, systemSettingsData]) => {
        setTariffs(settingsData.settings ?? null);
        setBuyoutCommissionTariffs(buyoutCommissionTariffsData.tiers ?? []);
        setCatalog(catalogData.items ?? []);
        if (systemSettingsData.settings?.lowDensityVolumeThresholdKgM3 !== undefined) {
          setLowDensityVolumeThresholdKgM3(Number(systemSettingsData.settings.lowDensityVolumeThresholdKgM3));
        }
      })
      .finally(() => setLoadingTariffs(false));
  }, [open]);

  // Density/volume tariffs are scoped per destinationCountry (see
  // prisma/schema.prisma) — re-fetched whenever the country changes, not
  // just when the dialog opens, so switching countries before submitting
  // immediately shows that country's own categories (empty for anything
  // but Russia today). See PB-V5 chat 2026-08-02.
  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch(`/api/manager-density-tariffs?country=${destinationCountry}`).then((res) => res.json()),
      fetch(`/api/manager-volume-tariffs?country=${destinationCountry}`).then((res) => res.json()),
    ]).then(([tiersData, volumeTariffsData]) => {
      setTiers(tiersData.tiers ?? []);
      setVolumeTariffs(volumeTariffsData.tariffs ?? []);
    });
  }, [open, destinationCountry]);

  // Load (or reset) the form when the dialog opens — pre-fill from the
  // existing quote in edit mode, blank out for a fresh "Новый просчёт".
  useEffect(() => {
    if (!open) return;
    setError(null);
    setPhotos([]);
    setRemovedPhotoIds([]);

    if (!editingQuoteId) {
      setAttachedServices([]);
      setServicesOpen(false);
      setDestinationCountry(BLANK_FORM.destinationCountry);
      setQuoteType(BLANK_FORM.quoteType);
      setIsCustomProduction(BLANK_FORM.isCustomProduction);
      setProductName(BLANK_FORM.productName);
      setProductLink(BLANK_FORM.productLink);
      setProductDescription(BLANK_FORM.productDescription);
      setColor(BLANK_FORM.color);
      setDimensions(BLANK_FORM.dimensions);
      setQuantity(BLANK_FORM.quantity);
      setPriceCnyPerUnit(BLANK_FORM.priceCnyPerUnit);
      setChinaDeliveryCny(BLANK_FORM.chinaDeliveryCny);
      setWeightPerUnitKg(BLANK_FORM.weightPerUnitKg);
      setVolumeInputMode(BLANK_FORM.volumeInputMode);
      setUnitLengthCm(BLANK_FORM.unitLengthCm);
      setUnitWidthCm(BLANK_FORM.unitWidthCm);
      setUnitHeightCm(BLANK_FORM.unitHeightCm);
      setTotalLengthCm(BLANK_FORM.totalLengthCm);
      setTotalWidthCm(BLANK_FORM.totalWidthCm);
      setTotalHeightCm(BLANK_FORM.totalHeightCm);
      setManualTotalVolumeM3(BLANK_FORM.manualTotalVolumeM3);
      setUnitVolumeM3(BLANK_FORM.unitVolumeM3);
      setDeliveryPricingMode(BLANK_FORM.deliveryPricingMode);
      setCargoCategoryKey(BLANK_FORM.cargoCategoryKey);
      setCargoDiscountUsd(BLANK_FORM.cargoDiscountUsd);
      setCargoRateUsdOverride(BLANK_FORM.cargoRateUsdOverride);
      setCargoRateOverrideConfirmed(false);
      setCnyRateRubOverride(BLANK_FORM.cnyRateRubOverride);
      setCnyRateOverrideConfirmed(false);
      setUsdRateRubOverride(BLANK_FORM.usdRateRubOverride);
      setUsdRateOverrideConfirmed(false);
      setBuyoutCommissionPercentOverride(BLANK_FORM.buyoutCommissionPercentOverride);
      setBuyoutCommissionOverrideConfirmed(false);
      setFrozenRates(null);
      setExistingPhotos([]);
      return;
    }

    setLoadingQuote(true);
    fetch(`/api/manager-quotes/${editingQuoteId}`)
      .then((res) => res.json())
      .then(
        (data: {
          quote: QuoteDetail;
          photos: ExistingPhoto[];
          attachedServices: { serviceCatalogItemId: string | null; name: string; priceRub: string }[];
        }) => {
          const q = data.quote;
          setDestinationCountry(q.destinationCountry);
          setQuoteType(q.quoteType);
          setIsCustomProduction(q.isCustomProduction);
          setProductName(q.productName);
          setProductLink(q.productLink ?? "");
          setProductDescription(q.productDescription ?? "");
          setColor(q.color ?? "");
          setDimensions(q.dimensions ?? "");
          setQuantity(String(q.quantity));
          setPriceCnyPerUnit(q.priceCnyPerUnit);
          setChinaDeliveryCny(q.chinaDeliveryCny);
          setWeightPerUnitKg(q.weightPerUnitKg);
          setVolumeInputMode(q.volumeInputMode);
          setUnitLengthCm(q.unitLengthCm ?? "");
          setUnitWidthCm(q.unitWidthCm ?? "");
          setUnitHeightCm(q.unitHeightCm ?? "");
          setTotalLengthCm(q.totalLengthCm ?? "");
          setTotalWidthCm(q.totalWidthCm ?? "");
          setTotalHeightCm(q.totalHeightCm ?? "");
          // manual_total mode has no separate stored input — totalVolumeM3 is
          // exactly what was typed in, regardless of mode.
          setManualTotalVolumeM3(q.volumeInputMode === "manual_total" ? q.totalVolumeM3 : "");
          setUnitVolumeM3(q.unitVolumeM3 ?? "");
          setDeliveryPricingMode(q.deliveryPricingMode);
          setCargoCategoryKey(q.cargoCategoryKey ?? "");
          setCargoDiscountUsd(Number(q.cargoDiscountUsd) > 0 ? q.cargoDiscountUsd : "");
          setCargoRateUsdOverride(q.cargoRateUsdOverride ?? "");
          setCargoRateOverrideConfirmed(q.cargoRateOverrideConfirmed);
          setCnyRateRubOverride(q.cnyRateRubOverride ?? "");
          setCnyRateOverrideConfirmed(q.cnyRateOverrideConfirmed);
          setUsdRateRubOverride(q.usdRateRubOverride ?? "");
          setUsdRateOverrideConfirmed(q.usdRateOverrideConfirmed);
          setBuyoutCommissionPercentOverride(q.buyoutCommissionPercentOverride ?? "");
          setBuyoutCommissionOverrideConfirmed(q.buyoutCommissionOverrideConfirmed);
          setFrozenRates({
            cnyRateRub: Number(q.cnyRateUsed),
            usdRateRub: Number(q.usdRateUsed),
            buyoutCommissionPercent: Number(q.buyoutCommissionPercent),
            searchFeeWaived: q.searchFeeWaived,
          });
          setExistingPhotos(data.photos ?? []);
          setAttachedServices(
            (data.attachedServices ?? []).map((s) => ({
              serviceCatalogItemId: s.serviceCatalogItemId ?? undefined,
              name: s.name,
              priceRub: s.priceRub,
            })),
          );
          setServicesOpen((data.attachedServices ?? []).length > 0);
        },
      )
      .finally(() => setLoadingQuote(false));
  }, [open, editingQuoteId]);

  const densityCategories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const tier of tiers) seen.set(tier.categoryKey, tier.categoryLabel);
    return Array.from(seen.entries());
  }, [tiers]);

  const volumeCategories = useMemo(
    () => volumeTariffs.map((t): [string, string] => [t.categoryKey, t.categoryLabel]),
    [volumeTariffs],
  );

  // "По объёму" now prices per category too (see VolumeTariff), same as
  // "по плотности" — both modes need a category selected, just from
  // whichever tariff table matches the active mode.
  const categories = deliveryPricingMode === "density" ? densityCategories : volumeCategories;

  const selectedCategoryHint = cargoCategoryHint(destinationCountry, cargoCategoryKey);

  useEffect(() => {
    if (categories.length === 0) return;
    if (!categories.some(([key]) => key === cargoCategoryKey)) setCargoCategoryKey(categories[0][0]);
  }, [categories, cargoCategoryKey]);

  // parseLocaleNumber handles a comma decimal separator; the NaN check
  // covers anything else unparseable, so a bad value falls through to
  // "not entered" everywhere else in this file treats undefined that way
  // (e.g. cnyRateRub's `num(cnyRateRubOverride) ?? ...` fallback) instead
  // of silently propagating NaN into computeQuote — see lib/number.ts.
  const num = (value: string) => {
    if (!value.trim()) return undefined;
    const parsed = parseLocaleNumber(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const attachedServicesTotalRub = useMemo(
    () => attachedServices.reduce((sum, s) => sum + (Number(s.priceRub) || 0), 0),
    [attachedServices],
  );

  const preview = useMemo(() => {
    if (!tariffs) return null;
    const quantityNum = num(quantity);
    const priceNum = num(priceCnyPerUnit);
    const weightNum = num(weightPerUnitKg);
    if (!quantityNum || priceNum === undefined || !weightNum) return null;

    // Editing an existing quote: FX/buyout%/search fee stay frozen at
    // whatever they were when the quote was created (mirrors the PATCH
    // route exactly) — only a *new* quote prices off today's live tariffs.
    // Cargo rate itself (density or volume) is always a live category
    // lookup, matching the server.
    const isFrozen = isEditing && frozenRates;
    const searchServiceFeeRub = isFrozen && frozenRates.searchFeeWaived
      ? 0
      : quoteType === "standard"
        ? Number(tariffs.standardPriceRub)
        : quoteType === "expert"
          ? Number(tariffs.expertPriceRub)
          : Number(tariffs.proPriceRub);

    const customProductionFeeRub = !isCustomProduction
      ? 0
      : quoteType === "standard"
        ? Number(tariffs.customProductionStandardRub)
        : quoteType === "expert"
          ? Number(tariffs.customProductionExpertRub)
          : Number(tariffs.customProductionProRub);

    const densityTiers: DensityTierInput[] = tiers.map((tier) => ({
      categoryKey: tier.categoryKey,
      minDensity: Number(tier.minDensity),
      maxDensity: tier.maxDensity === null ? null : Number(tier.maxDensity),
      ratePerKgUsd: Number(tier.ratePerKgUsd),
    }));
    const volumeTariffInputs: VolumeTierInput[] = volumeTariffs.map((tariff) => ({
      categoryKey: tariff.categoryKey,
      rateUsdPerCbm: Number(tariff.rateUsdPerCbm),
    }));
    // Manual override (any mode): a single bracket at that %, same as the
    // server. Otherwise: frozen (editing) — a single bracket spanning the
    // whole range, same trick as the PATCH route — always resolves to this
    // quote's own already-snapshotted %, regardless of totalPriceRub. Live
    // (new quote): today's actual bracket ladder from Тарифы.
    const buyoutCommissionOverrideNum = num(buyoutCommissionPercentOverride);
    const buyoutCommissionTiers: BuyoutCommissionTierInput[] =
      buyoutCommissionOverrideNum !== undefined
        ? [{ minAmountRub: 0, maxAmountRub: null, commissionPercent: buyoutCommissionOverrideNum }]
        : isFrozen
          ? [{ minAmountRub: 0, maxAmountRub: null, commissionPercent: frozenRates.buyoutCommissionPercent }]
          : buyoutCommissionTariffs.map((tier) => ({
              minAmountRub: Number(tier.minAmountRub),
              maxAmountRub: tier.maxAmountRub === null ? null : Number(tier.maxAmountRub),
              commissionPercent: Number(tier.commissionPercent),
            }));

    const inputsWithoutRate = {
      quantity: quantityNum,
      priceCnyPerUnit: priceNum,
      chinaDeliveryCny: num(chinaDeliveryCny) ?? 0,
      weightPerUnitKg: weightNum,
      volumeInputMode,
      unitLengthCm: num(unitLengthCm),
      unitWidthCm: num(unitWidthCm),
      unitHeightCm: num(unitHeightCm),
      totalLengthCm: num(totalLengthCm),
      totalWidthCm: num(totalWidthCm),
      totalHeightCm: num(totalHeightCm),
      manualTotalVolumeM3: num(manualTotalVolumeM3),
      unitVolumeM3: num(unitVolumeM3),
      deliveryPricingMode,
      cargoCategoryKey: cargoCategoryKey || undefined,
      densityTiers,
      volumeTariffs: volumeTariffInputs,
      searchServiceFeeRub,
      buyoutCommissionTiers,
      // A manual override is usable immediately, same as
      // cnyRateRubOverride below — confirmation only gates the sign-off.
      usdRateRub: num(usdRateRubOverride) ?? (isFrozen ? frozenRates.usdRateRub : Number(tariffs.usdRateRub)),
      attachedServicesTotalRub,
      customProductionFeeRub,
      cargoDiscountUsd: num(cargoDiscountUsd),
      cargoRateUsdOverride: num(cargoRateUsdOverride),
      lowDensityVolumeThresholdKgM3,
    };

    const manualOverride = num(cnyRateRubOverride);
    try {
      if (manualOverride !== undefined) {
        return { ...computeQuote({ ...inputsWithoutRate, cnyRateRub: manualOverride }), cnyRateRubResolved: manualOverride };
      }
      if (isFrozen) {
        return {
          ...computeQuote({ ...inputsWithoutRate, cnyRateRub: frozenRates.cnyRateRub }),
          cnyRateRubResolved: frozenRates.cnyRateRub,
        };
      }
      // New quote, no manual override: pick the ¥→₽ bracket the quote's
      // own total actually falls into (product + China delivery + buyout
      // commission + services + custom-production, all converted at the
      // base tier) rather than always pricing off the "от 1000¥" tier —
      // see computeQuoteWithAutoCnyTier in lib/quote-engine.ts.
      const cnyTiers: CnyRateTiers = {
        base: Number(tariffs.cnyRateRub),
        tier3000: tariffs.cnyRateRubTier3000 !== null ? Number(tariffs.cnyRateRubTier3000) : null,
        tier10000: tariffs.cnyRateRubTier10000 !== null ? Number(tariffs.cnyRateRubTier10000) : null,
        tier30000: tariffs.cnyRateRubTier30000 !== null ? Number(tariffs.cnyRateRubTier30000) : null,
      };
      const result = computeQuoteWithAutoCnyTier(inputsWithoutRate, cnyTiers);
      return { ...result.computed, cnyRateRubResolved: result.cnyRateRub };
    } catch {
      return null;
    }
  }, [
    tariffs,
    tiers,
    volumeTariffs,
    buyoutCommissionTariffs,
    lowDensityVolumeThresholdKgM3,
    quoteType,
    isCustomProduction,
    quantity,
    priceCnyPerUnit,
    chinaDeliveryCny,
    weightPerUnitKg,
    volumeInputMode,
    unitLengthCm,
    unitWidthCm,
    unitHeightCm,
    totalLengthCm,
    totalWidthCm,
    totalHeightCm,
    manualTotalVolumeM3,
    unitVolumeM3,
    deliveryPricingMode,
    cargoCategoryKey,
    attachedServicesTotalRub,
    cargoDiscountUsd,
    cargoRateUsdOverride,
    cnyRateRubOverride,
    usdRateRubOverride,
    buyoutCommissionPercentOverride,
    isEditing,
    frozenRates,
  ]);

  function toggleRemovePhoto(id: string) {
    setExistingPhotos((current) => current.filter((p) => p.id !== id));
    setRemovedPhotoIds((current) => [...current, id]);
  }

  function toggleService(item: ServiceCatalogItemRecord) {
    setAttachedServices((current) => {
      const exists = current.some((s) => s.serviceCatalogItemId === item.id);
      if (exists) return current.filter((s) => s.serviceCatalogItemId !== item.id);
      return [...current, { serviceCatalogItemId: item.id, name: item.name, priceRub: guessPriceRub(item.price) }];
    });
  }

  function updateServicePrice(serviceCatalogItemId: string, priceRub: string) {
    setAttachedServices((current) =>
      current.map((s) => (s.serviceCatalogItemId === serviceCatalogItemId ? { ...s, priceRub } : s)),
    );
  }

  const catalogByDirection = useMemo(() => {
    const groups = new Map<string, ServiceCatalogItemRecord[]>();
    for (const item of catalog) {
      if (!ATTACHABLE_DIRECTIONS.includes(item.direction)) continue;
      const list = groups.get(item.direction) ?? [];
      list.push(item);
      groups.set(item.direction, list);
    }
    return ATTACHABLE_DIRECTIONS.filter((d) => groups.has(d)).map((d) => [d, groups.get(d)!] as const);
  }, [catalog]);

  async function handleSubmit(shouldExport: boolean) {
    if (submitting || !productDescription.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("clientId", client.id);
      formData.append("destinationCountry", destinationCountry);
      formData.append("quoteType", quoteType);
      formData.append("isCustomProduction", String(isCustomProduction));
      if (productName.trim()) formData.append("productName", productName.trim());
      if (productLink.trim()) formData.append("productLink", productLink.trim());
      if (productDescription.trim()) formData.append("productDescription", productDescription.trim());
      if (color.trim()) formData.append("color", color.trim());
      if (dimensions.trim()) formData.append("dimensions", dimensions.trim());

      // Draft path — only the description was filled in (manager hasn't
      // received supplier numbers yet). Fall back to safe placeholder
      // values that pass server validation and compute to a ~0 total,
      // rather than blocking quote creation entirely; the manager fills in
      // the real numbers later via "Редактировать". cargoCategoryKey must
      // still be a real category — computeQuote hard-requires one even for
      // this placeholder total, so this reuses whatever category is
      // currently selected (or the first available "по объёму" one if
      // nothing was picked yet) instead of leaving it empty.
      if (!preview) {
        formData.append("quantity", quantity.trim() || "1");
        formData.append("priceCnyPerUnit", priceCnyPerUnit.trim() || "0");
        formData.append("chinaDeliveryCny", chinaDeliveryCny.trim() || "0");
        formData.append("weightPerUnitKg", weightPerUnitKg.trim() || "0.01");
        formData.append("volumeInputMode", "manual_total");
        formData.append("manualTotalVolumeM3", manualTotalVolumeM3.trim() || "0.01");
        formData.append("deliveryPricingMode", "volume");
        const draftCargoCategoryKey = cargoCategoryKey || volumeCategories[0]?.[0] || "";
        if (draftCargoCategoryKey) formData.append("cargoCategoryKey", draftCargoCategoryKey);
      } else {
        formData.append("quantity", quantity);
        formData.append("priceCnyPerUnit", priceCnyPerUnit);
        formData.append("chinaDeliveryCny", chinaDeliveryCny || "0");
        formData.append("weightPerUnitKg", weightPerUnitKg);
        formData.append("volumeInputMode", volumeInputMode);
        if (volumeInputMode === "per_unit_dims") {
          formData.append("unitLengthCm", unitLengthCm);
          formData.append("unitWidthCm", unitWidthCm);
          formData.append("unitHeightCm", unitHeightCm);
        } else if (volumeInputMode === "total_dims") {
          formData.append("totalLengthCm", totalLengthCm);
          formData.append("totalWidthCm", totalWidthCm);
          formData.append("totalHeightCm", totalHeightCm);
        } else if (volumeInputMode === "per_unit_volume") {
          formData.append("unitVolumeM3", unitVolumeM3);
        } else {
          formData.append("manualTotalVolumeM3", manualTotalVolumeM3);
        }
        formData.append("deliveryPricingMode", deliveryPricingMode);
        // Required for both modes now — "по объёму" prices per category too.
        formData.append("cargoCategoryKey", cargoCategoryKey);
        if (cargoDiscountUsd.trim()) formData.append("cargoDiscountUsd", cargoDiscountUsd.trim());
        if (cargoRateUsdOverride.trim()) formData.append("cargoRateUsdOverride", cargoRateUsdOverride.trim());
        if (cnyRateRubOverride.trim()) formData.append("cnyRateRubOverride", cnyRateRubOverride.trim());
        if (usdRateRubOverride.trim()) formData.append("usdRateRubOverride", usdRateRubOverride.trim());
        if (buyoutCommissionPercentOverride.trim()) {
          formData.append("buyoutCommissionPercentOverride", buyoutCommissionPercentOverride.trim());
        }
      }

      if (attachedServices.length > 0) {
        formData.append(
          "services",
          JSON.stringify(attachedServices.map((s) => ({ ...s, priceRub: Number(s.priceRub) || 0 }))),
        );
      }
      photos.forEach((photo, index) => formData.append(`photo${index}`, photo));
      if (isEditing && removedPhotoIds.length > 0) formData.append("removePhotoIds", removedPhotoIds.join(","));

      const res = await fetch(isEditing ? `/api/manager-quotes/${editingQuoteId}` : "/api/manager-quotes", {
        method: isEditing ? "PATCH" : "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось сохранить просчёт.");
        return;
      }

      if (shouldExport) {
        const link = document.createElement("a");
        link.href = `/api/manager-quotes/${isEditing ? editingQuoteId : data.quote.id}/pdf`;
        link.click();
      }

      onSaved();
      onOpenChange(false);
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setSubmitting(false);
    }
  }

  const availablePhotoSlots = 3 - existingPhotos.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Редактировать просчёт" : "Просчёт"} для клиента {client.name}
          </DialogTitle>
        </DialogHeader>

        {loadingTariffs || loadingQuote ? (
          <p className="text-sm text-text-secondary">Загрузка…</p>
        ) : !tariffs ? (
          <p className="text-sm text-error">Тарифы не заданы — заполните вкладку «Тарифы» перед созданием просчёта.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Страна назначения</Label>
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
              {tiers.length === 0 && volumeTariffs.length === 0 && (
                <p className="text-xs text-warning">
                  Для этой страны тарифы карго ещё не заданы — просчёт не удастся сохранить, пока руководитель их не
                  добавит во вкладке «Тарифы» → «Карго».
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Тип просчёта</Label>
              <TooltipProvider>
                <div className="flex gap-2">
                  {QUOTE_TYPES.map((type) => {
                    const info = SEARCH_TIER_INFO[type.value];
                    return (
                      <Tooltip key={type.value}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setQuoteType(type.value)}
                            className={cn(
                              "flex-1 rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors",
                              quoteType === type.value
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-surface text-text-secondary hover:text-text",
                            )}
                          >
                            <span className="inline-flex items-center gap-1">
                              {type.label}
                              <Info className="h-3 w-3 opacity-60" />
                            </span>
                            <div className="text-xs opacity-80">
                              {fmt(Number(tariffs[`${type.value}PriceRub` as keyof TariffSettingsRecord]))} ₽
                            </div>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64">
                          {info.intro && <p className="mb-1 font-medium">{info.intro}</p>}
                          <ul className="space-y-0.5">
                            {info.bullets.map((bullet, i) => (
                              <li key={i}>• {bullet}</li>
                            ))}
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
            </div>

            <label
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                isCustomProduction ? "border-primary bg-primary/5" : "border-border bg-surface",
              )}
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isCustomProduction}
                  onChange={(e) => setIsCustomProduction(e.target.checked)}
                />
                <span>
                  <span className="font-medium text-text">Производство под заказ</span>
                  <span className="block text-xs text-text-secondary">
                    Товара нет в свободной продаже — фабрика делает его специально под этот заказ
                  </span>
                </span>
              </span>
              {tariffs && (
                <span className="shrink-0 text-xs font-semibold text-primary">
                  + {fmt(Number(CUSTOM_PRODUCTION_FIELD_BY_TYPE[quoteType](tariffs)))} ₽
                </span>
              )}
            </label>

            <div className="space-y-1.5">
              <Label>Фото товара</Label>
              {existingPhotos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {existingPhotos.map((photo) => (
                    <div key={photo.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element -- session-gated API route, not a static asset */}
                      <img
                        src={`/api/manager-quotes/photos/${photo.id}`}
                        alt={photo.originalName}
                        className="h-full w-full object-cover"
                      />
                      {/* Always visible, not just on :hover — there's no hover
                          state on a touch screen, so the opacity-0 + group-hover
                          version left mobile with no visible way to remove a
                          photo at all. */}
                      <button
                        type="button"
                        onClick={() => toggleRemovePhoto(photo.id)}
                        aria-label={`Удалить фото ${photo.originalName}`}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {availablePhotoSlots > 0 ? (
                <PhotoPicker photos={photos} onChange={(next) => setPhotos(next.slice(0, availablePhotoSlots))} />
              ) : (
                <p className="text-xs text-text-secondary">Максимум 3 фото — удалите одно, чтобы добавить новое.</p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="product-name">Название товара (необязательно)</Label>
                <Input id="product-name" value={productName} onChange={(e) => setProductName(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="product-link">Ссылка на товар (не показывается клиенту)</Label>
                <Input id="product-link" value={productLink} onChange={(e) => setProductLink(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="product-description">Описание товара</Label>
                <Textarea id="product-description" value={productDescription} onChange={(e) => setProductDescription(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="product-color">Цвет</Label>
                <Input id="product-color" value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="product-dimensions">Габариты товара</Label>
                <Input id="product-dimensions" value={dimensions} onChange={(e) => setDimensions(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quantity">Количество</Label>
                <Input id="quantity" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="price-cny">Цена за шт, ¥</Label>
                <Input id="price-cny" type="number" min={0} step="0.01" value={priceCnyPerUnit} onChange={(e) => setPriceCnyPerUnit(e.target.value)} required />
              </div>
            </div>

            {preview && (
              <div className="rounded-lg border border-border bg-bg p-2.5 text-xs">
                <div className="flex justify-between text-text-secondary">
                  <span>Цена за шт, ₽</span>
                  <span className="font-medium text-text">{fmt(preview.priceRubPerUnit)} ₽</span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>Общая цена товара</span>
                  <span className="font-medium text-text">
                    {fmt(preview.totalPriceCny)} ¥ / {fmt(preview.totalPriceRub)} ₽
                  </span>
                </div>
              </div>
            )}

            {!cnyRateRubOverride.trim() && !isEditing && preview && (
              <p className="text-xs text-text-secondary">
                Курс сейчас: {preview.cnyRateRubResolved.toFixed(2)} ₽ за ¥ (подбирается автоматически по сумме просчёта;
                ручная корректировка — в самом низу формы)
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="china-delivery">Доставка по Китаю, ¥</Label>
              <Input id="china-delivery" type="number" min={0} step="0.01" value={chinaDeliveryCny} onChange={(e) => setChinaDeliveryCny(e.target.value)} />
              {preview && <p className="text-xs text-text-secondary">≈ {fmt(preview.chinaDeliveryRub)} ₽</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="weight-per-unit">Вес за 1 шт, кг</Label>
              <Input id="weight-per-unit" type="number" min={0} step="0.01" value={weightPerUnitKg} onChange={(e) => setWeightPerUnitKg(e.target.value)} required />
              {preview && <p className="text-xs text-text-secondary">Общий вес: {preview.totalWeightKg.toFixed(1)} кг</p>}
            </div>

            <div className="space-y-2">
              <Label>Объём груза</Label>
              <div className="flex gap-1 rounded-lg border border-border bg-surface p-0.5">
                {(
                  [
                    ["per_unit_dims", "Габариты 1 шт"],
                    ["total_dims", "Общие габариты"],
                    ["per_unit_volume", "Объём 1 шт"],
                    ["manual_total", "Объём вручную"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setVolumeInputMode(mode)}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                      volumeInputMode === mode ? "bg-primary/10 text-primary" : "text-text-secondary hover:text-text",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {volumeInputMode === "per_unit_dims" && (
                <div className="grid grid-cols-3 gap-2">
                  <Input type="number" placeholder="Длина, см" value={unitLengthCm} onChange={(e) => setUnitLengthCm(e.target.value)} />
                  <Input type="number" placeholder="Ширина, см" value={unitWidthCm} onChange={(e) => setUnitWidthCm(e.target.value)} />
                  <Input type="number" placeholder="Высота, см" value={unitHeightCm} onChange={(e) => setUnitHeightCm(e.target.value)} />
                </div>
              )}
              {volumeInputMode === "total_dims" && (
                <div className="grid grid-cols-3 gap-2">
                  <Input type="number" placeholder="Длина, см" value={totalLengthCm} onChange={(e) => setTotalLengthCm(e.target.value)} />
                  <Input type="number" placeholder="Ширина, см" value={totalWidthCm} onChange={(e) => setTotalWidthCm(e.target.value)} />
                  <Input type="number" placeholder="Высота, см" value={totalHeightCm} onChange={(e) => setTotalHeightCm(e.target.value)} />
                </div>
              )}
              {volumeInputMode === "per_unit_volume" && (
                <Input type="number" placeholder="Объём 1 шт, м³" value={unitVolumeM3} onChange={(e) => setUnitVolumeM3(e.target.value)} />
              )}
              {volumeInputMode === "manual_total" && (
                <Input type="number" placeholder="Общий объём, м³" value={manualTotalVolumeM3} onChange={(e) => setManualTotalVolumeM3(e.target.value)} />
              )}

              {preview && (
                <p className="text-xs text-text-secondary">
                  Объём: {preview.totalVolumeM3.toFixed(3)} м³ · Плотность:{" "}
                  <span
                    className={cn(
                      "font-bold",
                      preview.densityKgM3 < 100 ? "text-warning" : "text-primary",
                    )}
                  >
                    {fmt(preview.densityKgM3)} кг/м³
                  </span>
                  {preview.densityKgM3 < 100 && " (< 100 — считается по объёму, а не по тарифу категории)"}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Тарификация доставки</Label>
              <div className="flex gap-1 rounded-lg border border-border bg-surface p-0.5">
                {(
                  [
                    ["density", "По плотности"],
                    ["volume", "По объёму"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDeliveryPricingMode(mode)}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                      deliveryPricingMode === mode ? "bg-primary/10 text-primary" : "text-text-secondary hover:text-text",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Both modes price per category now — "по объёму" via
                  VolumeTariff the same way "по плотности" uses DensityTariff. */}
              <Select value={cargoCategoryKey} onValueChange={setCargoCategoryKey}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Категория груза" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCategoryHint && (
                <p className="text-xs text-text-secondary">
                  <span className="font-medium">Что сюда входит:</span> {selectedCategoryHint}
                </p>
              )}
              {preview && (
                <p className="text-xs text-text-secondary">
                  Ставка: ${preview.cargoRateUsd.toFixed(2)}/{preview.cargoPricingBasis === "density" ? "кг" : "м³"}
                  {cargoRateUsdOverride.trim() && " (вручную — корректировка в самом низу формы)"} →{" "}
                  {preview.cargoDeliveryUsd.toFixed(1)}$ / {fmt(preview.cargoDeliveryRub)} ₽
                  {preview.cargoDiscountUsd > 0 && ` (скидка -$${preview.cargoDiscountUsd.toFixed(1)})`}
                </p>
              )}
              <div className="space-y-1.5">
                <Label>Скидка на карго для клиента, $ (необязательно)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0"
                  value={cargoDiscountUsd}
                  onChange={(e) => setCargoDiscountUsd(e.target.value)}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setServicesOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-2 p-2.5 text-left"
              >
                <span className="text-sm font-medium text-text">
                  Доп. услуги из прайс-листа Panda Bridge
                  {attachedServices.length > 0 ? ` (${attachedServices.length})` : ""}
                </span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-secondary transition-transform", servicesOpen && "rotate-180")} />
              </button>
              {servicesOpen &&
                (catalogByDirection.length === 0 ? (
                  <p className="px-2.5 pb-2.5 text-xs text-text-secondary">Прайс-лист пуст.</p>
                ) : (
                  <div className="mx-2.5 mb-2.5 max-h-48 space-y-3 overflow-y-auto rounded-lg border border-border p-2.5">
                    {catalogByDirection.map(([direction, items]) => (
                    <div key={direction}>
                      <div className="text-xs font-semibold text-text-secondary">
                        {DIRECTION_LABEL[direction] ?? direction}
                      </div>
                      <div className="mt-1 space-y-1">
                        {items.map((item) => {
                          const attached = attachedServices.find((s) => s.serviceCatalogItemId === item.id);
                          return (
                            <div key={item.id} className="flex items-center gap-2">
                              <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={Boolean(attached)}
                                  onChange={() => toggleService(item)}
                                  className="shrink-0"
                                />
                                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                                <span className="shrink-0 text-xs text-text-secondary">{item.price}</span>
                              </label>
                              {attached && (
                                <Input
                                  type="number"
                                  min={0}
                                  step="1"
                                  value={attached.priceRub}
                                  onChange={(e) => updateServicePrice(item.id, e.target.value)}
                                  placeholder="₽"
                                  className="h-7 w-20 shrink-0 px-1.5 text-sm"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    ))}
                  </div>
                ))}
            </div>

            {preview && (
              <div className="space-y-1 rounded-lg border border-border bg-bg p-3 text-sm">
                <div className="flex justify-between text-text-secondary">
                  <span>Стоимость товара</span>
                  <span>{fmt(preview.totalPriceRub)} ₽</span>
                </div>
                {preview.chinaDeliveryRub > 0 && (
                  <div className="flex justify-between text-text-secondary">
                    <span>Доставка по Китаю</span>
                    <span>{fmt(preview.chinaDeliveryRub)} ₽</span>
                  </div>
                )}
                <div className="flex justify-between text-text-secondary">
                  <span>Карго доставка</span>
                  <span>{fmt(preview.cargoDeliveryRub)} ₽</span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>Услуга поиска</span>
                  <span>{fmt(preview ? (quoteType === "standard" ? Number(tariffs.standardPriceRub) : quoteType === "expert" ? Number(tariffs.expertPriceRub) : Number(tariffs.proPriceRub)) : 0)} ₽</span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>
                    Комиссия за выкуп ({preview.buyoutCommissionPercent.toFixed(2)}%
                    {buyoutCommissionPercentOverride.trim() && " — вручную"})
                  </span>
                  <span>{fmt(preview.buyoutCommissionRub)} ₽</span>
                </div>
                {isCustomProduction && (
                  <div className="flex justify-between text-text-secondary">
                    <span>Производство под заказ</span>
                    <span>
                      {fmt(
                        quoteType === "standard"
                          ? Number(tariffs.customProductionStandardRub)
                          : quoteType === "expert"
                            ? Number(tariffs.customProductionExpertRub)
                            : Number(tariffs.customProductionProRub),
                      )}{" "}
                      ₽
                    </span>
                  </div>
                )}
                {attachedServices.map((service, index) => (
                  <div key={index} className="flex justify-between text-text-secondary">
                    <span className="truncate">{service.name}</span>
                    <span>{fmt(Number(service.priceRub) || 0)} ₽</span>
                  </div>
                ))}
                <div className="mt-1 flex justify-between border-t border-border pt-1.5 text-base font-bold text-text">
                  <span>ИТОГО</span>
                  <span className="text-primary">{fmt(preview.totalRub)} ₽</span>
                </div>
              </div>
            )}

            <div className="space-y-3 rounded-xl border border-warning/30 bg-warning/5 p-3">
              <div className="text-xs font-semibold text-warning">
                ⚠️ Ручная настройка тарифов — требуется подтверждение руководителя
              </div>

              <div className="space-y-1.5">
                <Label>Ручной курс юаня, ₽ (необязательно — иначе берётся из тарифов)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="из тарифов"
                  value={cnyRateRubOverride}
                  onChange={(e) => setCnyRateRubOverride(e.target.value)}
                />
                {cnyRateRubOverride.trim() &&
                  (isEditing ? (
                    <p className={cn("text-xs", cnyRateOverrideConfirmed ? "text-success" : "text-warning")}>
                      {cnyRateOverrideConfirmed
                        ? "✓ Курс подтверждён руководителем/старшим менеджером."
                        : "Ждёт подтверждения руководителем/старшим менеджером (вкладка «Подтверждения») — курс уже применяется в просчёте."}
                    </p>
                  ) : (
                    <p className="text-xs text-warning">
                      После сохранения попадёт на подтверждение руководителю/старшему менеджеру (вкладка «Подтверждения»).
                    </p>
                  ))}
              </div>

              <div className="space-y-1.5">
                <Label>Ручной курс доллара, ₽ (необязательно — иначе берётся из тарифов)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="из тарифов"
                  value={usdRateRubOverride}
                  onChange={(e) => setUsdRateRubOverride(e.target.value)}
                />
                {usdRateRubOverride.trim() &&
                  (isEditing ? (
                    <p className={cn("text-xs", usdRateOverrideConfirmed ? "text-success" : "text-warning")}>
                      {usdRateOverrideConfirmed
                        ? "✓ Курс подтверждён руководителем/старшим менеджером."
                        : "Ждёт подтверждения руководителем/старшим менеджером (вкладка «Подтверждения») — курс уже применяется в просчёте."}
                    </p>
                  ) : (
                    <p className="text-xs text-warning">
                      После сохранения попадёт на подтверждение руководителю/старшему менеджеру (вкладка «Подтверждения»).
                    </p>
                  ))}
              </div>

              <div className="space-y-1.5">
                <Label>
                  Ручная ставка карго, ${preview?.cargoPricingBasis === "volume" ? "м³" : "кг"} (необязательно — иначе
                  берётся из тарифов)
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="из тарифов"
                  value={cargoRateUsdOverride}
                  onChange={(e) => setCargoRateUsdOverride(e.target.value)}
                />
                {cargoRateUsdOverride.trim() &&
                  (isEditing ? (
                    <p className={cn("text-xs", cargoRateOverrideConfirmed ? "text-success" : "text-warning")}>
                      {cargoRateOverrideConfirmed
                        ? "✓ Ставка подтверждена руководителем/старшим менеджером."
                        : "Ждёт подтверждения руководителем/старшим менеджером (вкладка «Подтверждения») — до этого прибыль по карго считается приблизительно."}
                    </p>
                  ) : (
                    <p className="text-xs text-warning">
                      После сохранения попадёт на подтверждение руководителю/старшему менеджеру (вкладка «Подтверждения»).
                    </p>
                  ))}
              </div>

              <div className="space-y-1.5">
                <Label>Ручная комиссия за выкуп, % (необязательно — иначе берётся из тарифов)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  placeholder="из тарифов"
                  value={buyoutCommissionPercentOverride}
                  onChange={(e) => setBuyoutCommissionPercentOverride(e.target.value)}
                />
                {buyoutCommissionPercentOverride.trim() &&
                  (isEditing ? (
                    <p className={cn("text-xs", buyoutCommissionOverrideConfirmed ? "text-success" : "text-warning")}>
                      {buyoutCommissionOverrideConfirmed
                        ? "✓ Комиссия подтверждена руководителем/старшим менеджером."
                        : "Ждёт подтверждения руководителем/старшим менеджером (вкладка «Подтверждения») — комиссия уже применяется в просчёте."}
                    </p>
                  ) : (
                    <p className="text-xs text-warning">
                      После сохранения попадёт на подтверждение руководителю/старшему менеджеру (вкладка «Подтверждения»).
                    </p>
                  ))}
              </div>
            </div>

            {error && <p className="text-xs text-error">{error}</p>}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSubmit(false)}
                disabled={submitting || !productDescription.trim()}
                className="flex-1"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить и закрыть"}
              </Button>
              <Button
                type="button"
                onClick={() => handleSubmit(true)}
                disabled={submitting || !productDescription.trim()}
                className="flex-1"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : !preview ? (
                  "Создать черновик и скачать PDF"
                ) : (
                  "Сохранить и скачать PDF"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { QuoteDialog };
