import { CheckCircle2 } from "lucide-react";
import { Reveal } from "@/components/common/reveal";
import { Eyebrow } from "@/components/ui/eyebrow";

const upcoming = [
  "Panda AI",
  "Panda HUB",
  "Академия предпринимателей",
  "Цифровые сервисы",
  "Автоматизация международной торговли",
];

function Future() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-24">
      <Reveal className="mx-auto max-w-2xl text-center">
        <Eyebrow className="justify-center">Дальше</Eyebrow>
        <h2 className="mt-3 text-3xl font-extrabold text-text sm:text-4xl">Будущее Panda Bridge</h2>
        <p className="mt-4 text-base text-text-secondary">Сейчас мы развиваем:</p>

        <ul className="mx-auto mt-6 flex max-w-md flex-col gap-2.5 text-left">
          {upcoming.map((item) => (
            <li
              key={item}
              className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3"
            >
              <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-success" />
              <span className="text-sm font-medium text-text">{item}</span>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-base text-text-secondary">
          Наша цель — создать платформу, где предприниматель сможет управлять всем бизнесом с
          Китаем из одного личного кабинета.
        </p>
      </Reveal>
    </section>
  );
}

export { Future };
