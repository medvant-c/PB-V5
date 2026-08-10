import "server-only";
import type { IssuedInvoiceCurrency, IssuedInvoiceType } from "@/generated/prisma/enums";
import { nextIssuedInvoiceDisplayId } from "@/lib/display-ids";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

// Split from recordIssuedInvoice below so the global "Все просчёты" bundle
// route (app/api/manager-quotes/buyout-invoice-pdf-bundle) can upload the
// combined PDF ONCE, then write one IssuedInvoice row per client group
// against the same storageKey, instead of duplicating the file on disk per
// client. See prisma/schema.prisma's IssuedInvoice comment.
async function uploadInvoiceFile(buffer: Buffer, fileName: string): Promise<{ storageKey: string }> {
  const stored = await storage.upload(buffer, fileName);
  return { storageKey: stored.key };
}

interface RecordIssuedInvoiceParams {
  type: IssuedInvoiceType;
  currency: IssuedInvoiceCurrency;
  clientId: string;
  managerId: string;
  amountTotal: number;
  quoteIds: string[];
  storageKey: string;
  fileName: string;
  mimeType: string;
}

async function recordIssuedInvoice(params: RecordIssuedInvoiceParams): Promise<void> {
  const displayId = await nextIssuedInvoiceDisplayId();
  await prisma.issuedInvoice.create({
    data: {
      displayId,
      type: params.type,
      currency: params.currency,
      clientId: params.clientId,
      managerId: params.managerId,
      amountTotal: params.amountTotal,
      fileName: params.fileName,
      storageKey: params.storageKey,
      mimeType: params.mimeType,
      quotes: { create: params.quoteIds.map((quoteId) => ({ quoteId })) },
    },
  });
}

export { recordIssuedInvoice, uploadInvoiceFile };
