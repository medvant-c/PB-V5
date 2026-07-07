import { Check, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const modules = [
  { title: "Основы работы с Китаем", status: "done" },
  { title: "Поиск товара", status: "done" },
  { title: "Площадки: Alibaba, 1688, Poizon, Taobao", status: "done" },
  { title: "Переговоры", status: "current" },
  { title: "Контроль качества", status: "locked" },
  { title: "Логистика", status: "locked" },
  { title: "Документы", status: "locked" },
  { title: "Маркетплейсы", status: "locked" },
  { title: "Собственный бренд", status: "locked" },
  { title: "Масштабирование", status: "locked" },
] as const;

const completed = modules.filter((module) => module.status === "done").length;

function AcademyProgress() {
  return (
    <Card className="border-primary/15 bg-gradient-to-br from-primary/5 to-secondary/5 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-text">Ваш прогресс</div>
        <div className="text-sm font-semibold text-primary">{completed} из {modules.length} модулей</div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/6">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
          style={{ width: `${(completed / modules.length) * 100}%` }}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {modules.map((module, index) => (
          <div
            key={module.title}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm",
              module.status === "current"
                ? "border-primary/30 bg-surface font-semibold text-text"
                : "border-border bg-surface/60 text-text-secondary",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                module.status === "done" && "bg-success/15 text-success",
                module.status === "current" && "bg-gradient-to-br from-primary to-secondary text-white",
                module.status === "locked" && "bg-black/6 text-text-secondary",
              )}
            >
              {module.status === "done" ? (
                <Check className="h-3.5 w-3.5" />
              ) : module.status === "locked" ? (
                <Lock className="h-3.5 w-3.5" />
              ) : (
                index + 1
              )}
            </span>
            {module.title}
          </div>
        ))}
      </div>
    </Card>
  );
}

export { AcademyProgress };
