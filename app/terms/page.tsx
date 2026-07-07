import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Пользовательское соглашение — Panda Bridge",
  description: "Условия использования сайта и услуг Panda Bridge.",
};

const sections = [
  {
    title: "1. Предмет соглашения",
    body: "Настоящее соглашение регулирует условия использования сайта Panda Bridge и порядок оказания услуг: запуск бизнеса, производство, фулфилмент, логистика, обучение и AI-инструменты для работы с Китаем.",
  },
  {
    title: "2. Порядок сотрудничества",
    body: "Условия конкретного проекта (сроки, стоимость, объём работ) согласовываются индивидуально после обращения через сайт и фиксируются в отдельном договоре или коммерческом предложении.",
  },
  {
    title: "3. Права и обязанности сторон",
    body: "Panda Bridge обязуется предоставлять услуги добросовестно и информировать клиента о ходе работ. Клиент обязуется предоставлять достоверную информацию, необходимую для выполнения услуг.",
  },
  {
    title: "4. Ответственность",
    body: "Стороны несут ответственность в соответствии с условиями индивидуального договора, заключаемого по итогам согласования конкретного проекта.",
  },
  {
    title: "5. Изменение условий",
    body: "Panda Bridge вправе обновлять данное соглашение. Актуальная версия всегда доступна на этой странице.",
  },
];

export default function TermsPage() {
  return (
    <div className="space-y-8 pb-16">
      <PageHeader
        eyebrow="Правовая информация"
        title="Пользовательское соглашение"
        description="Условия использования сайта и услуг Panda Bridge."
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
