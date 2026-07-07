import { Mail, MessageCircle, Phone, Send } from "lucide-react";
import type { ContactChannel } from "@/types";

export const contactChannels: ContactChannel[] = [
  {
    icon: MessageCircle,
    label: "WhatsApp",
    value: "+86 134 6080 8888",
    note: "Быстрый ответ",
    href: "https://wa.me/8613460808888",
  },
  {
    icon: Send,
    label: "Telegram",
    value: "@PandaBridge_China",
    note: "Онлайн 24/7",
    href: "https://t.me/PandaBridge_China",
  },
  {
    icon: Mail,
    label: "Email",
    value: "hello@panda-bridge.com",
    note: "Ответим в течение часа",
    href: "mailto:hello@panda-bridge.com",
  },
  {
    icon: Phone,
    label: "Телефон",
    value: "+7 (499) 110-88-88",
    note: "Пн–Вс 09:00 – 21:00 (МСК)",
    href: "tel:+74991108888",
  },
  {
    icon: MessageCircle,
    label: "WeChat",
    value: "pandabridge_cn",
    note: "Добавляйте в друзья",
  },
];
