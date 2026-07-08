import { Handshake, Layers, Network, Sparkles, Eye } from "lucide-react";
import { Reveal } from "@/components/common/reveal";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Card } from "@/components/ui/card";

const points = [
  {
    icon: Layers,
    title: "Всё в одном месте",
    description: "Не нужно искать пять разных компаний.",
  },
  {
    icon: Handshake,
    title: "Работаем как партнёры",
    description: "Мы заинтересованы в росте бизнеса клиента.",
  },
  {
    icon: Network,
    title: "Собственная экосистема",
    description: "Все сервисы работают вместе.",
  },
  {
    icon: Eye,
    title: "Прозрачность",
    description: "Каждый этап понятен клиенту.",
  },
  {
    icon: Sparkles,
    title: "Современные технологии",
    description: "Мы автоматизируем процессы при помощи AI.",
  },
];

function UniqueValue() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal className="text-center">
          <Eyebrow className="justify-center">Почему мы</Eyebrow>
          <h2 className="mt-3 text-3xl font-extrabold text-text sm:text-4xl">
            Что делает Panda Bridge уникальной
          </h2>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {points.map((point, i) => {
            const Icon = point.icon;
            return (
              <Reveal key={point.title} delay={i * 0.06}>
                <Card className="flex h-full flex-col gap-3 p-6 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/15">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="text-base font-bold text-text">{point.title}</div>
                  <p className="text-sm text-text-secondary">{point.description}</p>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export { UniqueValue };
