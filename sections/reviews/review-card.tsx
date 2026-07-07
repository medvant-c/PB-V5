import { MapPin, Star } from "lucide-react";
import type { Review } from "@/types";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function ReviewCard({ review }: { review: Review }) {
  return (
    <Card className="flex w-[280px] shrink-0 snap-start flex-col gap-4 p-6 sm:w-auto">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 text-sm font-bold text-primary">
          {review.name
            .split(" ")
            .map((part) => part[0])
            .join("")}
        </span>
        <div>
          <div className="text-sm font-bold text-text">{review.name}</div>
          <div className="text-xs text-text-secondary">{review.role}</div>
        </div>
      </div>

      <span className="w-fit rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
        {review.tag}
      </span>

      <p className="text-sm text-text-secondary">&ldquo;{review.quote}&rdquo;</p>

      <div className="mt-auto flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={cn(
              "h-4 w-4",
              i < review.rating ? "fill-warning text-warning" : "text-border",
            )}
          />
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span>{review.date}</span>
        <span className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" /> {review.location}
        </span>
      </div>
    </Card>
  );
}

export { ReviewCard };
