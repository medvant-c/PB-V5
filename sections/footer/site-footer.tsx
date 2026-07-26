import Link from "next/link";
import { Mail, MessageCircle, Send } from "lucide-react";
import { Logo } from "@/components/common/logo";
import { contactChannels } from "@/data/contacts";

const legalLinks = [
  { label: "Политика конфиденциальности", href: "/privacy" },
  { label: "Пользовательское соглашение", href: "/terms" },
];

const whatsapp = contactChannels.find((c) => c.label === "WhatsApp");
const telegram = contactChannels.find((c) => c.label === "Telegram");
const email = contactChannels.find((c) => c.label === "Email");

const socials = [
  whatsapp && { icon: MessageCircle, href: whatsapp.href!, label: "WhatsApp" },
  telegram && { icon: Send, href: telegram.href!, label: "Telegram" },
  email && { icon: Mail, href: email.href!, label: "Email" },
].filter((social): social is { icon: typeof MessageCircle; href: string; label: string } => Boolean(social));

function SiteFooter() {
  return (
    <footer className="border-t border-border px-4 py-8 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <div className="flex flex-col items-center gap-3 sm:items-start">
          <Logo />
          <p className="text-xs text-text-secondary">
            © {new Date().getFullYear()} Panda Bridge. Все права защищены.{" "}
            <Link href="/desk/manager" className="text-[10px] text-text-secondary/40 hover:text-text-secondary">
              Вход для сотрудников
            </Link>
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-text-secondary">
          {legalLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-text">
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {socials.map((social) => {
            const Icon = social.icon;
            return (
              <a
                key={social.label}
                href={social.href}
                target={social.href.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
                aria-label={social.label}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/3 text-text-secondary hover:bg-black/6 hover:text-text"
              >
                <Icon className="h-4 w-4" />
              </a>
            );
          })}
        </div>
      </div>
    </footer>
  );
}

export { SiteFooter };
