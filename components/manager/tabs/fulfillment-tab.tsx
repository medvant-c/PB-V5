"use client";

import { useState } from "react";
import { ClipboardList, Package, Plug, Receipt, Settings, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { FulfillmentClientsSection } from "@/components/manager/tabs/fulfillment/clients-section";
import { FulfillmentRequestsSection } from "@/components/manager/tabs/fulfillment/requests-section";
import { FulfillmentShipmentsSection } from "@/components/manager/tabs/fulfillment/shipments-section";
import { FulfillmentInvoicesSection } from "@/components/manager/tabs/fulfillment/invoices-section";
import { FulfillmentApiIntegrationSection } from "@/components/manager/tabs/fulfillment/api-integration-section";
import { ManagerFulfillmentSettingsTab } from "@/components/manager/tabs/settings/fulfillment-section";

// «Фулфилмент» — под-вкладки, тот же паттерн SUB_TABS, что и
// components/manager/tabs/settings-tab.tsx. Раньше был одним файлом
// (~1800 строк): клиенты, карточки товара и список заявок смешаны на
// одном экране — разложено при просьбе пользователя разнести это на
// отдельные вкладки. Всё видно любому менеджеру (не ownerOnly), как и
// раньше — реальная граница видимости у каждой под-вкладки своя (по
// getVisibleManagerIds), не по роли. См. план «Фулфилмент: под-вкладки»,
// PB-V5 chat 2026-09-12.
const SUB_TABS = [
  { id: "clients", label: "Клиенты", icon: Package, Component: FulfillmentClientsSection },
  { id: "requests", label: "Заявки на обработку", icon: ClipboardList, Component: FulfillmentRequestsSection },
  { id: "shipments", label: "Отгрузки", icon: Truck, Component: FulfillmentShipmentsSection },
  { id: "invoices", label: "Выставленные счета", icon: Receipt, Component: FulfillmentInvoicesSection },
  { id: "api", label: "Интеграция с API", icon: Plug, Component: FulfillmentApiIntegrationSection },
  { id: "settings", label: "Настройки", icon: Settings, Component: ManagerFulfillmentSettingsTab },
] as const;

function ManagerFulfillmentTab() {
  const [activeSubTab, setActiveSubTab] = useState<(typeof SUB_TABS)[number]["id"]>("clients");
  const active = SUB_TABS.find((t) => t.id === activeSubTab) ?? SUB_TABS[0];
  const ActiveComponent = active.Component;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-text">Фулфилмент</h2>
        <p className="mt-1 text-sm text-text-secondary">Клиенты фулфилмента, их карточки товаров и заявки на складскую обработку.</p>
      </div>

      <nav className="flex flex-wrap items-center gap-1 border-b border-border pb-3">
        {SUB_TABS.map((tab) => (
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

      <ActiveComponent />
    </div>
  );
}

export { ManagerFulfillmentTab };
