import { Globe2, Rocket, ShieldCheck, TrendingUp } from "lucide-react";

const points = [
  { icon: ShieldCheck, title: "Надёжность", description: "Проверенные партнёры и строгий контроль качества на каждом этапе." },
  { icon: Rocket, title: "Скорость", description: "Оперативные решения и быстрая доставка без лишних задержек." },
  { icon: TrendingUp, title: "Выгода", description: "Прямые контракты с фабриками и оптимизация всех процессов." },
  { icon: Globe2, title: "Масштабирование", description: "Инфраструктура и технологии, которые растут вместе с вами." },
];

function WhyUs() {
  return (
    <section className="px-4 sm:px-6">
      <div className="mx-auto max-w-6xl rounded-3xl bg-text px-6 py-10 text-white sm:px-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
          <div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">Почему Panda Bridge</h2>
            <p className="mt-3 text-sm text-white/70">
              Мы объединяем всё, что нужно для успешного бизнеса с Китаем, в одной экосистеме.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {points.map((point) => {
              const Icon = point.icon;
              return (
                <div key={point.title}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="mt-3 text-sm font-bold">{point.title}</div>
                  <p className="mt-1 text-sm text-white/60">{point.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export { WhyUs };
