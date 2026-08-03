"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, CheckSquare, Database, FileBarChart, FileText, Home, LogOut, Package, Settings, Tag, UserCog, Users, UsersRound, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ManagerClientsTab } from "@/components/manager/tabs/clients-tab";
import { ManagerAllQuotesTab } from "@/components/manager/tabs/all-quotes-tab";
import { ManagerStaffTab } from "@/components/manager/tabs/staff-tab";
import { ManagerPriceListTab } from "@/components/manager/tabs/price-list-tab";
import { ManagerDatabaseTab } from "@/components/manager/tabs/database-tab";
import { ManagerConfirmationsTab } from "@/components/manager/tabs/confirmations-tab";
import { ManagerCashTab } from "@/components/manager/tabs/cash-tab";
import { ManagerFulfillmentTab } from "@/components/manager/tabs/fulfillment-tab";
import { ManagerSettingsTab } from "@/components/manager/tabs/settings-tab";
import { ManagerProfitReportTab } from "@/components/manager/tabs/profit-report-tab";
import { ManagerDashboard } from "@/components/manager/manager-dashboard";
import { DailyPlanPanel } from "@/components/manager/daily-plan-panel";
import { DailyPlanReviewModal } from "@/components/manager/daily-plan-review-modal";
import { DailyPlanAssignedModal } from "@/components/manager/daily-plan-assigned-modal";
import { AutoRefresh } from "@/components/manager/auto-refresh";
import { DeploymentWatcher } from "@/components/manager/deployment-watcher";

interface ManagerWorkspaceProps {
  name: string;
  role: "manager" | "senior" | "owner";
  // Set only when the owner is viewing via "Войти как сотрудник" — carries
  // their own name for the banner, not just a boolean, so the banner can
  // say who's actually looking without another round trip.
  impersonatedByName: string | null;
}

const ROLE_LABEL: Record<ManagerWorkspaceProps["role"], string> = {
  manager: "Менеджер",
  senior: "Старший менеджер",
  owner: "Руководитель",
};

// Клиенты/Тарифы are visible to everyone; Сотрудники (staff admin — create
// accounts, block, reset passwords, assign старший менеджер hierarchy) is
// owner-only — same array-of-{id,label,icon,Component} pattern as
// components/desk/desk-workspace.tsx, filtered by role below.
const ALL_SECTIONS = [
  // Own tab now, not a permanent fixture above every other tab (see PB-V5
  // chat 2026-07-30) — it was pushing every tab's actual content down the
  // page regardless of whether the manager wanted to see it right then.
  { id: "home", label: "Главная", icon: Home, Component: ManagerDashboard, ownerOnly: false, seniorOrOwnerOnly: false },
  { id: "clients", label: "Клиенты", icon: Users, Component: ManagerClientsTab, ownerOnly: false, seniorOrOwnerOnly: false },
  // Same quotes, same actions as inside a client's own card (see
  // components/manager/tabs/clients-tab.tsx's ClientQuotes, reused here
  // with no clientId) — just flattened into one sortable/filterable list
  // instead of grouped by client. See PB-V5 chat 2026-08-01.
  { id: "all-quotes", label: "Все просчёты", icon: FileText, Component: ManagerAllQuotesTab, ownerOnly: false, seniorOrOwnerOnly: false },
  { id: "fulfillment", label: "Фулфилмент", icon: Package, Component: ManagerFulfillmentTab, ownerOnly: false, seniorOrOwnerOnly: false },
  { id: "confirmations", label: "Подтверждения", icon: CheckSquare, Component: ManagerConfirmationsTab, ownerOnly: false, seniorOrOwnerOnly: true },
  { id: "price-list", label: "Прайс-лист", icon: Tag, Component: ManagerPriceListTab, ownerOnly: true, seniorOrOwnerOnly: false },
  { id: "cash", label: "Отчёты по дням", icon: Wallet, Component: ManagerCashTab, ownerOnly: true, seniorOrOwnerOnly: false },
  { id: "profit-report", label: "Отчёт о прибыли", icon: FileBarChart, Component: ManagerProfitReportTab, ownerOnly: true, seniorOrOwnerOnly: false },
  { id: "database", label: "База данных", icon: Database, Component: ManagerDatabaseTab, ownerOnly: false, seniorOrOwnerOnly: false },
  { id: "staff", label: "Сотрудники", icon: UsersRound, Component: ManagerStaffTab, ownerOnly: true, seniorOrOwnerOnly: false },
  // Was owner-only — now visible to everyone since it also hosts Тарифы/
  // Карго (which every manager needs to price a quote); the genuinely
  // owner-only content (Руководящий состав, Тексты) is gated inside
  // ManagerSettingsTab itself, not at this nav level. See PB-V5 chat
  // 2026-07-31.
  { id: "settings", label: "Настройки", icon: Settings, Component: ManagerSettingsTab, ownerOnly: false, seniorOrOwnerOnly: false },
] as const;

const LAST_SECTION_STORAGE_KEY = "manager-last-section";

function isValidSectionId(value: string | null): value is (typeof ALL_SECTIONS)[number]["id"] {
  return ALL_SECTIONS.some((section) => section.id === value);
}

function ManagerWorkspace({ name, role, impersonatedByName }: ManagerWorkspaceProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [exitingImpersonation, setExitingImpersonation] = useState(false);
  const [activeSection, setActiveSection] = useState<(typeof ALL_SECTIONS)[number]["id"]>("home");
  const contentRef = useRef<HTMLDivElement>(null);

  // Badge on the "Подтверждения" nav tab — sum of every pending queue
  // ManagerConfirmationsTab itself lists (buyout facts, self-sourced
  // claims, manual cargo/¥/$ rates, manual buyout commission, and
  // unassigned self-registered clients), so it's visible without opening
  // the tab. Owner/senior only (that's who sees the tab at all — see
  // seniorOrOwnerOnly below; unassignedClients is itself owner-only and
  // just comes back empty for a senior), refetched whenever the active tab
  // changes so acting in Подтверждения and switching away clears/updates
  // the count without a dedicated polling loop.
  const [pendingConfirmationsCount, setPendingConfirmationsCount] = useState(0);
  useEffect(() => {
    if (role !== "owner" && role !== "senior") return;
    fetch("/api/manager-confirmations")
      .then((res) => res.json())
      .then((data) => {
        const buyouts = data.pendingBuyouts?.length ?? 0;
        const clients = data.pendingClients?.length ?? 0;
        const cargoRates = data.pendingCargoRates?.length ?? 0;
        const cnyRates = data.pendingCnyRates?.length ?? 0;
        const usdRates = data.pendingUsdRates?.length ?? 0;
        const buyoutCommissions = data.pendingBuyoutCommissions?.length ?? 0;
        const unassignedClients = data.pendingUnassignedClients?.length ?? 0;
        const usdtRateConfirmation = data.pendingUsdtRateConfirmation ? 1 : 0;
        setPendingConfirmationsCount(
          buyouts + clients + cargoRates + cnyRates + usdRates + buyoutCommissions + unassignedClients + usdtRateConfirmation,
        );
      })
      .catch(() => {});
  }, [role, activeSection]);

  // Clicking a nav tab jumps straight to that tab's content, skipping past
  // the dashboard above it — the dashboard is useful to glance at on load,
  // not something to scroll past every time you switch tabs.
  function selectSection(id: (typeof ALL_SECTIONS)[number]["id"]) {
    setActiveSection(id);
    contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const SECTIONS = ALL_SECTIONS.filter(
    (section) => (!section.ownerOnly || role === "owner") && (!section.seniorOrOwnerOnly || role === "owner" || role === "senior"),
  );

  useEffect(() => {
    const saved = window.localStorage.getItem(LAST_SECTION_STORAGE_KEY);
    if (isValidSectionId(saved) && SECTIONS.some((s) => s.id === saved)) setActiveSection(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- SECTIONS is derived from `role`, which is stable for the component's lifetime
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LAST_SECTION_STORAGE_KEY, activeSection);
  }, [activeSection]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/manager-logout", { method: "POST" });
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  // Full reload (not router.refresh()) — the new session's role/section
  // list can differ enough (owner sees owner-only tabs again) that a soft
  // refresh could leave stale client state pointing at a tab that no
  // longer applies.
  async function handleExitImpersonation() {
    setExitingImpersonation(true);
    try {
      const res = await fetch("/api/manager-exit-impersonation", { method: "POST" });
      if (res.ok) window.location.href = "/desk/manager";
    } finally {
      setExitingImpersonation(false);
    }
  }

  const active = SECTIONS.find((section) => section.id === activeSection) ?? SECTIONS[0];
  const ActiveComponent = active.Component;

  return (
    <div className="manager-cabinet-theme min-h-screen bg-bg">
      <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="sticky top-0 z-30 space-y-2">
        {impersonatedByName && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm backdrop-blur-md">
            <div className="flex items-center gap-2 text-text">
              <UserCog className="h-4 w-4 shrink-0 text-warning" />
              <span>
                {impersonatedByName} просматривает кабинет как <span className="font-semibold">{name}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={handleExitImpersonation}
              disabled={exitingImpersonation}
              className="shrink-0 rounded-lg border border-warning/40 px-2.5 py-1 text-xs font-medium text-text transition-colors hover:bg-warning/20 disabled:opacity-50"
            >
              {exitingImpersonation ? "Возврат…" : "Вернуться к своей учётке"}
            </button>
          </div>
        )}
        <div className="rounded-2xl border border-primary/15 bg-gradient-to-r from-primary/8 via-secondary/6 to-primary/8 p-3 shadow-sm backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white">
              <Briefcase className="h-4.5 w-4.5" />
            </span>
            <div>
              <h1 className="text-sm font-bold text-text">{name}</h1>
              <p className="text-xs text-text-secondary">{ROLE_LABEL[role]} · Panda Bridge</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Выйти
          </button>
        </div>

        <nav className="mt-3 flex flex-wrap items-center gap-1 border-t border-primary/10 pt-3">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => selectSection(section.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                activeSection === section.id
                  ? "bg-white text-primary shadow-sm"
                  : "text-text-secondary hover:bg-white/60 hover:text-text",
              )}
            >
              <section.icon className="h-4 w-4 shrink-0" />
              {section.label}
              {section.id === "confirmations" && pendingConfirmationsCount > 0 && (
                <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
                  {pendingConfirmationsCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
      </div>

      {/* Card doesn't forward refs (plain function component, not
          forwardRef) — wrapping div carries the scroll target instead. */}
      <div ref={contentRef} className="mt-6 scroll-mt-4">
        <Card className="p-6 sm:p-8">
          <ActiveComponent />
        </Card>
      </div>
    </div>
    {/* Sibling of the max-w-7xl content column, still inside
        .manager-cabinet-theme for its color tokens — fixed-position, so it
        stays visible and in place while switching tabs instead of being
        remounted/scrolled away with whichever tab is active. */}
    <DailyPlanPanel />
    <DailyPlanReviewModal />
    <DailyPlanAssignedModal />
    <AutoRefresh />
    <DeploymentWatcher />
    </div>
  );
}

export { ManagerWorkspace };
