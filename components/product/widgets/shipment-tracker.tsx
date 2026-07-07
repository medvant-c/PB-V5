import { MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";

const stages = ["Набрали", "На складе", "Проверили", "Упаковали", "Отправили", "В пути", "Прибыл"];
const currentStageIndex = 5;

const notifications = [
  "Ваш груз прибыл на склад",
  "Контейнер отправлен",
  "Пройдена таможня",
  "Машина в пути",
  "Доставка завтра",
];

function ShipmentTracker() {
  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Груз № CN-48291
          </div>
          <div className="mt-1 text-lg font-bold text-text">Гуанчжоу → Москва</div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
          <MapPin className="h-3.5 w-3.5" />
          Прибытие через 3 дня
        </div>
      </div>

      <div className="mt-8 flex items-center">
        {stages.map((stage, index) => (
          <div key={stage} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                  index <= currentStageIndex
                    ? "bg-gradient-to-br from-primary to-secondary text-white"
                    : "bg-black/6 text-text-secondary"
                }`}
              >
                {index + 1}
              </span>
              <span className="hidden text-center text-[11px] font-medium text-text-secondary sm:block">
                {stage}
              </span>
            </div>
            {index < stages.length - 1 && (
              <span
                className={`mx-2 h-0.5 flex-1 rounded-full ${
                  index < currentStageIndex ? "bg-primary" : "bg-black/6"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {notifications.map((note) => (
          <div
            key={note}
            className="flex items-center gap-2.5 rounded-xl bg-black/3 px-3.5 py-2.5 text-sm text-text-secondary"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
            {note}
          </div>
        ))}
      </div>
    </Card>
  );
}

export { ShipmentTracker };
