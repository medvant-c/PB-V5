import { SectionHeading } from "@/components/product/section-heading";
import { PandaAiChat } from "@/components/panda/panda-ai-chat";

function HomeAiChat() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Panda AI"
          title="Не хотите листать сценарии — просто спросите"
          description="Задайте вопрос о товаре, поставщике, сезонности или логистике — Panda AI ответит за секунды."
          center
        />
        <div className="mt-8">
          <PandaAiChat />
        </div>
      </div>
    </section>
  );
}

export { HomeAiChat };
