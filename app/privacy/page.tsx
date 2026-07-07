import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Политика конфиденциальности — Panda Bridge",
  description: "Как Panda Bridge собирает, использует и защищает персональные данные.",
};

const sections = [
  {
    title: "1. Общие положения",
    body: "Panda Bridge уважает конфиденциальность посетителей сайта и клиентов. Настоящая политика описывает, какие данные мы собираем, как их используем и какие права есть у пользователя в отношении своих данных.",
  },
  {
    title: "2. Какие данные мы собираем",
    body: "Имя, контактные данные (телефон, email, мессенджеры), название компании и содержание обращения — только те сведения, которые вы сами указываете в формах на сайте или при обращении к нам.",
  },
  {
    title: "3. Как мы используем данные",
    body: "Данные используются исключительно для обработки вашего обращения, подготовки коммерческого предложения и связи с вами по вопросам сотрудничества. Мы не передаём данные третьим лицам без вашего согласия.",
  },
  {
    title: "4. Хранение и защита данных",
    body: "Мы применяем разумные технические и организационные меры для защиты данных от несанкционированного доступа, изменения или удаления.",
  },
  {
    title: "5. Ваши права",
    body: "Вы можете в любой момент запросить удаление или изменение своих данных, написав на hello@panda-bridge.com.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="space-y-8 pb-16">
      <PageHeader
        eyebrow="Правовая информация"
        title="Политика конфиденциальности"
        description="Действует для всех пользователей сайта Panda Bridge."
      />

      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {sections.map((section) => (
            <Card key={section.title} className="p-6">
              <h2 className="text-base font-bold text-text">{section.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{section.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
