import { Card } from "@/components/ui/card";

const metrics = [
  { value: "-12%", label: "Себестоимость" },
  { value: "+8%", label: "Маржинальность" },
  { value: "+23%", label: "Оборот" },
  { value: "98%", label: "Своевременность поставок" },
];

const modules = [
  "Business Audit",
  "China Sourcing",
  "Cost Optimization",
  "Supply Management",
  "Quality Control",
  "Logistics",
  "Fulfillment",
  "Business Analytics",
  "Scaling",
  "Personal Manager",
];

function BusinessDashboard() {
  return (
    <Card className="p-6 sm:p-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl bg-black/3 p-4">
            <div className="text-xl font-bold text-text">{metric.value}</div>
            <div className="mt-1 text-xs text-text-secondary">{metric.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {modules.map((module) => (
          <div
            key={module}
            className="flex items-center justify-between rounded-xl border border-border px-4 py-2.5"
          >
            <span className="text-sm font-medium text-text">{module}</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Активно
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export { BusinessDashboard };
