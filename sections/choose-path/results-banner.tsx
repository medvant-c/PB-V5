import { Clock, ShieldCheck, TrendingUp, Headset } from "lucide-react";

const points = [
  { icon: ShieldCheck, value: "100%", label: "контроль качества на каждом этапе" },
  { icon: Clock, value: "до 70%", label: "экономия времени и ресурсов" },
  { icon: TrendingUp, value: "Рост", label: "продаж и прибыли вашего бизнеса" },
  { icon: Headset, value: "24/7", label: "Panda AI на связи" },
];

function ResultsBanner() {
  return (
    <section className="px-4 sm:px-6">
      <div className="mx-auto max-w-6xl rounded-3xl bg-gradient-to-br from-primary/5 to-secondary/5 p-6 sm:p-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr] lg:items-center">
          <div>
            <h2 className="text-xl font-extrabold text-text sm:text-2xl">
              Независимо от вашего сценария — результат один.
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              Вы экономите время, снижаете риски и масштабируете бизнес вместе с Panda Bridge.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {points.map((point) => {
              const Icon = point.icon;
              return (
                <div key={point.label} className="rounded-2xl bg-surface p-4 shadow-sm">
                  <Icon className="h-5 w-5 text-primary" />
                  <div className="mt-2 text-lg font-bold text-text">{point.value}</div>
                  <div className="text-xs text-text-secondary">{point.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export { ResultsBanner };
