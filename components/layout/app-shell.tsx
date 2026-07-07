"use client";

import { useState } from "react";
import { Menu, Send, X } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/common/logo";
import { LanguageProvider, useLanguage } from "@/components/common/language-context";
import { SidebarContent } from "@/components/layout/sidebar-content";
import { SiteSearch } from "@/components/layout/site-search";
import { buttonVariants } from "@/components/ui/button";
import { SiteFooter } from "@/sections/footer/site-footer";

function HeaderLanguageToggle() {
  const { language, toggleLanguage } = useLanguage();

  return (
    <button
      type="button"
      aria-label="Переключить язык"
      onClick={toggleLanguage}
      className="flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-text-secondary hover:bg-black/3"
    >
      {language}
    </button>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <LanguageProvider>
      <div className="mx-auto flex min-h-screen max-w-[1920px]">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border bg-surface lg:block">
          <SidebarContent />
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Закрыть меню"
              className="absolute inset-0 bg-black/30"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 w-72 bg-surface shadow-xl">
              <div className="flex justify-end p-3">
                <button
                  type="button"
                  aria-label="Закрыть меню"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-black/3"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex min-h-screen w-full flex-1 flex-col lg:ml-64">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-surface/80 px-4 py-3 backdrop-blur sm:px-6 lg:justify-end">
            <div className="flex items-center gap-3 lg:hidden">
              <button
                type="button"
                aria-label="Открыть меню"
                onClick={() => setMobileOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-black/3"
              >
                <Menu className="h-5 w-5" />
              </button>
              <Logo />
            </div>

            <div className="flex items-center gap-2">
              <SiteSearch />
              <div className="h-5 w-px bg-border" />
              <HeaderLanguageToggle />
              <Link
                href="/contacts"
                className={buttonVariants({ variant: "primary", size: "sm", className: "hidden sm:inline-flex" })}
              >
                Связаться с нами <Send className="h-4 w-4" />
              </Link>
            </div>
          </header>

          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </div>
    </LanguageProvider>
  );
}

export { AppShell };
