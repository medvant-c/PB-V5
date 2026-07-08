import { Handshake, ShieldCheck, Zap, ClipboardCheck, Lightbulb } from "lucide-react";
import { Reveal } from "@/components/common/reveal";

const values = [
  {
    icon: Handshake,
    title: "Долгосрочные отношения",
    description: "Мы строим партнёрство, а не разовые сделки.",
  },
  {
    icon: ShieldCheck,
    title: "Честность",
    description: "Мы всегда говорим клиенту реальную ситуацию.",
  },
  {
    icon: Zap,
    title: "Скорость",
    description: "Бизнес не любит ожидания.",
  },
  {
    icon: ClipboardCheck,
    title: "Ответственность",
    description: "Каждый проект сопровождается нашей командой.",
  },
  {
    icon: Lightbulb,
    title: "Инновации",
    description: "Мы постоянно внедряем новые технологии.",
  },
];

function ValuesGlass() {
  return (
    <section className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-24">
      <div className="absolute inset-0 bg-gradient-to-br from-primary to-secondary" />

      <div className="relative mx-auto max-w-6xl">
        <Reveal className="text-center">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-white/80 uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            Ценности
          </div>
          <h2 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">Наши ценности</h2>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {values.map((value, i) => {
            const Icon = value.icon;
            return (
              <Reveal key={value.title} delay={i * 0.06}>
                <div className="flex h-full flex-col gap-3 rounded-2xl border border-white/25 bg-white/10 p-6 backdrop-blur-xl">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="text-base font-bold text-white">{value.title}</div>
                  <p className="text-sm text-white/80">{value.description}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export { ValuesGlass };
