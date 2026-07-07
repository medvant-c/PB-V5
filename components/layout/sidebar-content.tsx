import Link from "next/link";
import { Send } from "lucide-react";
import { Logo } from "@/components/common/logo";
import { LanguageSwitcher } from "@/components/common/language-switcher";
import { NavLink } from "@/components/layout/nav-link";
import { buttonVariants } from "@/components/ui/button";
import { directionsNav, mainNav, secondaryNav } from "@/data/navigation";

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-6 pb-4">
        <Logo />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {mainNav.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}

        <div className="my-2 border-t border-border" />

        {directionsNav.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}

        <div className="my-2 border-t border-border" />

        {secondaryNav.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="space-y-3 border-t border-border px-4 py-4">
        <Link
          href="/contacts"
          onClick={onNavigate}
          className={buttonVariants({ variant: "primary", className: "w-full" })}
        >
          Начать работу <Send className="h-4 w-4" />
        </Link>
        <LanguageSwitcher />
      </div>
    </div>
  );
}

export { SidebarContent };
