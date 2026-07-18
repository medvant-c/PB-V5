import Link from "next/link";
import { Send } from "lucide-react";
import { Logo } from "@/components/common/logo";
import { NavLink } from "@/components/layout/nav-link";
import { buttonVariants } from "@/components/ui/button";
import { directionsNavGroups, mainNav, secondaryNav } from "@/data/navigation";

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

        {directionsNavGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 pt-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              {group.label}
            </div>
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        ))}

        <div className="my-2 border-t border-border" />

        {secondaryNav.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="border-t border-border px-4 py-4">
        <Link
          href="/contacts"
          onClick={onNavigate}
          className={buttonVariants({ variant: "primary", className: "w-full" })}
        >
          Начать работу <Send className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

export { SidebarContent };
