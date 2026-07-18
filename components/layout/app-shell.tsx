"use client";

import { useState } from "react";
import { Menu, Send, UserRound, X } from "lucide-react";
import { MotionConfig } from "framer-motion";
import Link from "next/link";
import { Logo } from "@/components/common/logo";
import { BackToHomeButton } from "@/components/layout/back-to-home-button";
import { SidebarContent } from "@/components/layout/sidebar-content";
import { SiteSearch } from "@/components/layout/site-search";
import { buttonVariants } from "@/components/ui/button";
import { SiteFooter } from "@/sections/footer/site-footer";
import { cn } from "@/lib/utils";

function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Every framer-motion animation site-wide automatically collapses to an
          instant, transform-free state when the user has reduced motion on —
          no per-animation fallback needed. */}
      <MotionConfig reducedMotion="user">
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
                  className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-black/3"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex min-h-screen w-full min-w-0 flex-1 flex-col lg:ml-64">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-surface/80 px-4 py-3 backdrop-blur sm:px-6 lg:justify-end">
            <div className="flex items-center gap-3 lg:hidden">
              <button
                type="button"
                aria-label="Открыть меню"
                onClick={() => setMobileOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-black/3"
              >
                <Menu className="h-5 w-5" />
              </button>
              <Logo />
            </div>

            <div className="flex items-center gap-2">
              <SiteSearch />
              <Link
                href="/account"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
              >
                <UserRound className="h-4 w-4" />
                <span className="hidden sm:inline">Личный кабинет</span>
              </Link>
              <div className="h-5 w-px bg-border" />
              <Link
                href="/contacts"
                className={cn(buttonVariants({ variant: "primary", size: "sm" }), "hidden sm:inline-flex")}
              >
                Связаться с нами <Send className="h-4 w-4" />
              </Link>
            </div>
          </header>

          <main className="min-w-0 flex-1">{children}</main>
          <SiteFooter />
        </div>

        <BackToHomeButton />
      </div>
      </MotionConfig>
    </>
  );
}

export { AppShell };
