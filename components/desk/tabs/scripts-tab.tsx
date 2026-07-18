"use client";

import { FileQuestion } from "lucide-react";
import { EmptyState } from "@/components/desk/empty-state";

// Placeholder pending real content — the user referenced a "книга менеджера"
// (manager's playbook) as the source for scripts/cheat-sheets, but no file
// arrived. Structure is ready; content slots in once the source material does.
function ScriptsTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Скрипты продаж, чек-листы по этапам сделки и шпаргалки для менеджеров.
      </p>
      <EmptyState
        icon={FileQuestion}
        message="Раздел пока пуст — содержимое переносится из книги менеджера. Пришлите файл, и я наполню его реальными скриптами и чек-листами."
      />
    </div>
  );
}

export { ScriptsTab };
