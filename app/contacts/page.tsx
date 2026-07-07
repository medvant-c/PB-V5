import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { ContactChannelCard } from "@/sections/contacts/contact-channel-card";
import { Geography } from "@/sections/contacts/geography";
import { ContactForm } from "@/sections/contacts/contact-form";
import { FinalCta } from "@/sections/contacts/final-cta";
import { contactChannels } from "@/data/contacts";

export const metadata: Metadata = {
  title: "Контакты — Panda Bridge",
  description: "Готовы ответить на ваши вопросы и помочь найти лучшее решение для вашего бизнеса с Китаем.",
};

export default function ContactsPage() {
  return (
    <div className="space-y-12 pb-16">
      <PageHeader
        eyebrow="Свяжитесь с нами"
        title="Мы всегда на связи"
        description="Готовы ответить на ваши вопросы и помочь найти лучшее решение для вашего бизнеса с Китаем."
      />

      <section className="px-4 sm:px-6">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {contactChannels.map((channel) => (
            <ContactChannelCard key={channel.label} channel={channel} />
          ))}
        </div>
      </section>

      <section className="px-4 sm:px-6" id="contact-form">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2">
          <Geography />
          <ContactForm />
        </div>
      </section>

      <FinalCta />
    </div>
  );
}
