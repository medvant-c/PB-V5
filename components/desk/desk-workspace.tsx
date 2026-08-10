"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Briefcase, Calculator, FileText, GraduationCap, Image as ImageIcon, Loader2, LogOut, ScrollText, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ClientsTab } from "@/components/desk/tabs/clients-tab";
import { DeskAiPanel } from "@/components/desk/desk-ai-panel";

function TabLoading() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-text-secondary">
      <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
    </div>
  );
}

// "Клиенты" — вкладка по умолчанию — грузится сразу вместе с остальным
// shell'ом; все остальные — отдельными чанками по требованию, та же причина
// и тот же приём, что и в components/manager/manager-workspace.tsx. См.
// PB-V5 chat 2026-08-10.
const ServicesTab = dynamic(() => import("@/components/desk/tabs/services-tab").then((m) => m.ServicesTab), { loading: TabLoading });
const ProductCardsTab = dynamic(() => import("@/components/desk/tabs/product-cards-tab").then((m) => m.ProductCardsTab), { loading: TabLoading });
const TrainingTab = dynamic(() => import("@/components/desk/tabs/training-tab").then((m) => m.TrainingTab), { loading: TabLoading });
const TemplatesTab = dynamic(() => import("@/components/desk/tabs/templates-tab").then((m) => m.TemplatesTab), { loading: TabLoading });
const ScriptsTab = dynamic(() => import("@/components/desk/tabs/scripts-tab").then((m) => m.ScriptsTab), { loading: TabLoading });
const CalculatorsTab = dynamic(() => import("@/components/desk/tabs/calculators-tab").then((m) => m.CalculatorsTab), { loading: TabLoading });

// Split into two clusters, not one flat peer list — "daily work" is what a
// manager touches on most visits, "reference" is materials consulted
// occasionally. Equal-weight buttons for all 7 treated every visit as if it
// could be for any of them; grouping at least signals which ones are the
// primary loop.
const WORK_SECTIONS = [
  {
    id: "clients",
    label: "Клиенты",
    description: "Клиенты, заказы и статусы",
    icon: Users,
    Component: ClientsTab,
  },
  {
    id: "services",
    label: "Услуги",
    description: "Каталог услуг и выполнение через AI",
    icon: Briefcase,
    Component: ServicesTab,
  },
  {
    id: "product-cards",
    label: "Карточки товара",
    description: "Бриф на фото + описания для маркетплейса",
    icon: ImageIcon,
    Component: ProductCardsTab,
  },
] as const;

const REFERENCE_SECTIONS = [
  {
    id: "templates",
    label: "Шаблоны",
    description: "Письма и документы",
    icon: FileText,
    Component: TemplatesTab,
  },
  {
    id: "scripts",
    label: "Скрипты и инструкции",
    description: "Чек-листы, шпаргалки",
    icon: ScrollText,
    Component: ScriptsTab,
  },
  {
    id: "training",
    label: "Обучение",
    description: "Модули и материалы",
    icon: GraduationCap,
    Component: TrainingTab,
  },
  {
    id: "calculators",
    label: "Калькуляторы",
    description: "Расчёты и оценки",
    icon: Calculator,
    Component: CalculatorsTab,
  },
] as const;

const SECTIONS = [...WORK_SECTIONS, ...REFERENCE_SECTIONS] as const;

const NOTIFICATIONS_POLL_MS = 20_000;
// Persisted so the desk doesn't reset to "Клиенты" every visit regardless
// of what a manager actually spends their day doing — e.g. someone who
// mostly builds marketplace cards shouldn't get routed past clients first.
const LAST_SECTION_STORAGE_KEY = "desk-last-section";

function isValidSectionId(value: string | null): value is (typeof SECTIONS)[number]["id"] {
  return SECTIONS.some((section) => section.id === value);
}

function DeskWorkspace() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<(typeof SECTIONS)[number]["id"]>("clients");
  const [loggingOut, setLoggingOut] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);

  // Read after mount (not in useState's initializer) to keep server- and
  // first-client-render markup identical — localStorage doesn't exist on
  // the server, so reading it any earlier would risk a hydration mismatch.
  useEffect(() => {
    const saved = window.localStorage.getItem(LAST_SECTION_STORAGE_KEY);
    if (isValidSectionId(saved)) setActiveSection(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LAST_SECTION_STORAGE_KEY, activeSection);
  }, [activeSection]);

  useEffect(() => {
    let cancelled = false;
    async function loadCount() {
      try {
        const res = await fetch("/api/desk-notifications-count");
        const data = await res.json();
        if (!cancelled && res.ok) setUnseenCount(data.count);
      } catch {
        // Best-effort — a failed poll just leaves the last known count.
      }
    }
    loadCount();
    const interval = setInterval(loadCount, NOTIFICATIONS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeSection]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/desk-logout", { method: "POST" });
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  const active = SECTIONS.find((section) => section.id === activeSection) ?? SECTIONS[0];
  const ActiveComponent = active.Component;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="rounded-2xl border border-primary/15 bg-gradient-to-r from-primary/8 via-secondary/6 to-primary/8 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-bold text-text">Рабочий стол</h1>
            <p className="text-xs text-text-secondary">Panda Bridge</p>
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
          {WORK_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                activeSection === section.id
                  ? "bg-white text-primary shadow-sm"
                  : "text-text-secondary hover:bg-white/60 hover:text-text",
              )}
            >
              <section.icon className="h-4 w-4 shrink-0" />
              {section.label}
              {section.id === "clients" && unseenCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-[10px] font-bold text-white">
                  {unseenCount}
                </span>
              )}
            </button>
          ))}

          <span aria-hidden className="mx-1.5 hidden h-6 w-px shrink-0 bg-primary/15 sm:block" />

          {REFERENCE_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                activeSection === section.id
                  ? "bg-white text-primary shadow-sm"
                  : "text-text-secondary hover:bg-white/60 hover:text-text",
              )}
            >
              <section.icon className="h-4 w-4 shrink-0" />
              {section.label}
            </button>
          ))}
        </nav>
      </div>

      <Card className="mt-6 p-6 sm:p-8">
        <ActiveComponent />
      </Card>

      <DeskAiPanel />
    </div>
  );
}

export { DeskWorkspace };
