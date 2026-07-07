import { contactStats } from "@/data/stats";
import { Card } from "@/components/ui/card";
import { GeographyMap } from "@/sections/contacts/geography-map";

function Geography() {
  return (
    <Card className="flex flex-col gap-6 p-6">
      <div>
        <h3 className="text-lg font-bold text-text">География нашей работы</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Работаем по всему миру, фокус на Китай, Россию и СНГ
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-bg">
        <GeographyMap />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {contactStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label}>
              <Icon className="h-4 w-4 text-primary" />
              <div className="mt-1 text-lg font-bold text-text">{stat.value}</div>
              <div className="text-xs text-text-secondary">{stat.label}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export { Geography };
