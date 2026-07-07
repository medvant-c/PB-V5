import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DetailItem {
  title: string;
  description: string;
}

interface DetailListProps {
  items: DetailItem[];
  columns?: 1 | 2;
  numbered?: boolean;
  className?: string;
}

function DetailList({ items, columns = 2, numbered, className }: DetailListProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4",
        columns === 2 && "lg:grid-cols-2",
        className,
      )}
    >
      {items.map((item, index) => (
        <Card key={item.title} className="flex gap-4 p-5">
          {numbered && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/4 text-xs font-bold text-text-secondary">
              {index + 1}
            </span>
          )}
          <div>
            <div className="text-sm font-bold text-text">{item.title}</div>
            <p className="mt-1 text-sm text-text-secondary">{item.description}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}

export { DetailList };
