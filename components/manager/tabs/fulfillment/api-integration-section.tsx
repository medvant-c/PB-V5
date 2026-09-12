"use client";

import { Plug } from "lucide-react";
import { EmptyState } from "@/components/desk/empty-state";

// Заглушка — интеграция с API маркетплейсов (WB/OZON/YM/Amazon) для
// авто-подтяжки заказов/остатков из личных кабинетов клиентов. Отдельная
// большая работа (хранение API-ключей клиентов, свой клиент под каждый
// маркетплейс, синхронизация) — вне рамок этого плана, обсуждается и
// планируется отдельно. См. план «Фулфилмент: под-вкладки», PB-V5 chat
// 2026-09-12.
function FulfillmentApiIntegrationSection() {
  return (
    <EmptyState
      icon={Plug}
      message="Функция в разработке — синхронизация заказов и остатков с личными кабинетами WB, OZON, Яндекс.Маркет и Amazon. Объём и порядок подключения обсудим отдельно."
    />
  );
}

export { FulfillmentApiIntegrationSection };
