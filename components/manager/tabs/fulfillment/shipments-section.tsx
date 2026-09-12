"use client";

import { FulfillmentOrdersList } from "./orders-list";

// Отгрузки — те же заявки, отфильтрованные по статусу "отгружено"
// (оплачено/не оплачено). Никакой новой модели — переиспользует уже
// существующий FulfillmentOrderStatus. См. PB-V5 chat 2026-09-12.
function FulfillmentShipmentsSection() {
  return (
    <FulfillmentOrdersList
      title="Отгрузки"
      description="Заявки в статусе «Отгружено» — оплаченные и неоплаченные."
      statusFilter={["shipped_paid", "shipped_unpaid"]}
    />
  );
}

export { FulfillmentShipmentsSection };
