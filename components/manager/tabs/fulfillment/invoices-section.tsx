"use client";

import { ManagerIssuedInvoicesTab } from "@/components/manager/tabs/issued-invoices-tab";

function FulfillmentInvoicesSection() {
  return <ManagerIssuedInvoicesTab kindFilter="fulfillment" />;
}

export { FulfillmentInvoicesSection };
