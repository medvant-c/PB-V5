"use client";

import { FulfillmentOrdersList } from "./orders-list";

function FulfillmentRequestsSection() {
  return <FulfillmentOrdersList title="Заявки на обработку" description="Товар, сумма услуг и статус обработки по каждой заявке — по всем клиентам фулфилмента." />;
}

export { FulfillmentRequestsSection };
