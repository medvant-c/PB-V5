"use client";

import { useEffect, useState } from "react";
import { Calculator, Crown, FileText, History, Package, Percent, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ManagerTariffsTab } from "@/components/manager/tabs/tariffs-tab";
import { ManagerCargoSettingsTab } from "@/components/manager/tabs/settings/cargo-settings-tab";
import { ManagerLeadershipTab } from "@/components/manager/tabs/settings/leadership-section";
import { ManagerQuotesBuyoutSettingsTab } from "@/components/manager/tabs/settings/quotes-buyout-section";
import { ManagerFulfillmentSettingsTab } from "@/components/manager/tabs/settings/fulfillment-section";
import { ManagerTextsSettingsTab } from "@/components/manager/tabs/settings/texts-section";
import { ManagerUpdatesTab } from "@/components/manager/tabs/settings/updates-section";

// «Настройки» — единая панель управления всеми данными и текстами, которые
// раньше можно было поменять только правкой кода: курсы валют, доли
// инвесторов, ставки премий, тексты подсказок. Разбита на под-вкладки по
// смыслу, а не по тому, в какой таблице что хранится — так «Тарифы» не
// смешивает клиентские цены с карго-ставками, а «Карго» собирает всё
// карго-специфичное в одном месте, даже если технически часть полей
// хранится в TariffSettings, а часть в SystemSettings. See PB-V5 chat
// 2026-07-31.
//
// ownerOnly here doesn't gate access (every manager needs to at least READ
// Тарифы/Карго to price a quote) — it only hides sub-tabs whose content is
// genuinely owner-confidential (investor profit shares) or purely
// administrative (dashboard hint-text copy) from the nav for non-owners.
// Editing rights within a visible sub-tab are still gated by its own
// canEdit/isOwner logic, same as before this reorganization.
const SUB_TABS = [
  { id: "tariffs", label: "Тарифы", icon: Calculator, Component: ManagerTariffsTab, ownerOnly: false },
  { id: "leadership", label: "Руководящий состав", icon: Crown, Component: ManagerLeadershipTab, ownerOnly: true },
  { id: "quotes-buyout", label: "Просчёты и выкуп", icon: Percent, Component: ManagerQuotesBuyoutSettingsTab, ownerOnly: false },
  { id: "fulfillment", label: "Фулфилмент", icon: Package, Component: ManagerFulfillmentSettingsTab, ownerOnly: false },
  { id: "cargo", label: "Карго", icon: Truck, Component: ManagerCargoSettingsTab, ownerOnly: false },
  { id: "texts", label: "Тексты", icon: FileText, Component: ManagerTextsSettingsTab, ownerOnly: true },
  { id: "updates", label: "Обновления", icon: History, Component: ManagerUpdatesTab, ownerOnly: true },
] as const;

function ManagerSettingsTab() {
  // Probes an owner-only endpoint once to decide which sub-tabs to show —
  // same "infer role from an API response, not a passed-down prop"
  // convention every other tab in this cabinet already uses (e.g.
  // isOwner = settings.cargoDensityMarginUsdPerKg !== undefined in
  // tariffs-tab.tsx).
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    fetch("/api/manager-investors")
      .then((res) => setIsOwner(res.ok))
      .catch(() => setIsOwner(false));
  }, []);

  const visibleTabs = SUB_TABS.filter((tab) => !tab.ownerOnly || isOwner);
  const [activeSubTab, setActiveSubTab] = useState<(typeof SUB_TABS)[number]["id"]>("tariffs");
  const active = visibleTabs.find((t) => t.id === activeSubTab) ?? visibleTabs[0];
  const ActiveComponent = active.Component;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-bold text-text">Настройки</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Цены, ставки, доли и тексты — всё, что раньше требовало правки кода, теперь редактируется здесь.
        </p>
      </div>

      <nav className="flex flex-wrap items-center gap-1 border-b border-border pb-3">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSubTab(tab.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              active.id === tab.id ? "bg-primary/10 text-primary" : "text-text-secondary hover:bg-bg hover:text-text",
            )}
          >
            <tab.icon className="h-4 w-4 shrink-0" />
            {tab.label}
          </button>
        ))}
      </nav>

      {ActiveComponent && <ActiveComponent />}
    </div>
  );
}

export { ManagerSettingsTab };
