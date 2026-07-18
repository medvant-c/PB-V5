import { Card } from "@/components/ui/card";
import { ServiceTooltip } from "@/components/product/service-tooltip";
import type { PriceCategory } from "@/types";

function PricingTable({ categories }: { categories: PriceCategory[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {categories.map((category) => (
        <Card key={category.title} className="overflow-hidden">
          <div className="border-b border-border bg-black/2 px-5 py-3 text-sm font-bold text-text">
            {category.title}
          </div>
          <div className="divide-y divide-border">
            {category.items.map((item) => (
              <div key={item.service} className="flex items-center justify-between gap-4 px-5 py-3">
                <ServiceTooltip
                  service={item.service}
                  result={item.result}
                  sampleFile={item.sampleFile}
                  sampleFileName={item.sampleFileName}
                />
                <span className="shrink-0 text-sm font-bold whitespace-nowrap text-text">{item.price}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

export { PricingTable };
