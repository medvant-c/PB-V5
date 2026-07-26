import type { Metadata } from "next";
import { cookies } from "next/headers";
import { COOKIE_NAME, verifyClientSessionToken } from "@/lib/client-auth";
import { prisma } from "@/lib/prisma";
import { AccountLoginForm } from "@/components/account/account-login-form";
import { AccountDashboard } from "@/components/account/account-dashboard";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const clientId = token ? await verifyClientSessionToken(token) : null;

  if (!clientId) {
    return <AccountLoginForm />;
  }

  // The session cookie can outlive a manager deactivating the account
  // (sessions last 30 days) — re-check on every load rather than only at
  // login, so deactivation actually takes effect immediately.
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { active: true } });
  if (!client || !client.active) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center px-4 text-center">
        <p className="text-sm font-medium text-text">Доступ к личному кабинету ограничен.</p>
        <p className="mt-1 text-sm text-text-secondary">Свяжитесь с вашим менеджером Panda Bridge.</p>
      </div>
    );
  }

  const orders = await prisma.order.findMany({
    where: { clientId },
    include: { events: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });

  const documents =
    orders.length === 0
      ? []
      : await prisma.deskFile.findMany({
          where: { tab: "orders", relatedId: { in: orders.map((order) => order.id) } },
          select: { id: true, relatedId: true, originalName: true, size: true, uploadedAt: true },
          orderBy: { uploadedAt: "desc" },
        });

  const quotes = await prisma.quote.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } });
  const [quotePhotos, quoteAttachedServices] = await Promise.all([
    quotes.length === 0
      ? []
      : prisma.deskFile.findMany({
          where: { tab: "quotes", relatedId: { in: quotes.map((q) => q.id) } },
          orderBy: { uploadedAt: "asc" },
          select: { id: true, relatedId: true },
        }),
    quotes.length === 0
      ? []
      : prisma.quoteAttachedService.findMany({
          where: { quoteId: { in: quotes.map((q) => q.id) } },
          orderBy: { createdAt: "asc" },
        }),
  ]);
  const photoIdsByQuoteId = new Map<string, string[]>();
  for (const photo of quotePhotos) {
    if (!photo.relatedId) continue;
    const list = photoIdsByQuoteId.get(photo.relatedId) ?? [];
    list.push(photo.id);
    photoIdsByQuoteId.set(photo.relatedId, list);
  }
  const servicesByQuoteId = new Map<string, { name: string; priceRub: number }[]>();
  for (const service of quoteAttachedServices) {
    const list = servicesByQuoteId.get(service.quoteId) ?? [];
    list.push({ name: service.name, priceRub: Number(service.priceRub) });
    servicesByQuoteId.set(service.quoteId, list);
  }

  return (
    <AccountDashboard
      orders={orders.map((order) => ({
        ...order,
        createdAt: order.createdAt.toISOString(),
        events: order.events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
      }))}
      documents={documents.map((doc) => ({ ...doc, uploadedAt: doc.uploadedAt.toISOString() }))}
      quotes={quotes.map((q) => ({
        id: q.id,
        displayId: q.displayId,
        status: q.status,
        quoteType: q.quoteType,
        productName: q.productName,
        productDescription: q.productDescription,
        color: q.color,
        dimensions: q.dimensions,
        quantity: q.quantity,
        priceCnyPerUnit: Number(q.priceCnyPerUnit),
        totalPriceCny: Number(q.totalPriceCny),
        priceRubPerUnit: Number(q.priceRubPerUnit),
        totalPriceRub: Number(q.totalPriceRub),
        chinaDeliveryRub: Number(q.chinaDeliveryRub),
        totalWeightKg: Number(q.totalWeightKg),
        totalVolumeM3: Number(q.totalVolumeM3),
        densityKgM3: Number(q.densityKgM3),
        cargoDeliveryUsd: Number(q.cargoDeliveryUsd),
        cargoDeliveryRub: Number(q.cargoDeliveryRub),
        searchServiceFeeRub: Number(q.searchServiceFeeRub),
        searchFeeWaived: q.searchFeeWaived,
        buyoutCommissionPercent: Number(q.buyoutCommissionPercent),
        buyoutCommissionRub: Number(q.buyoutCommissionRub),
        totalRub: Number(q.totalRub),
        cnyRateUsed: Number(q.cnyRateUsed),
        usdRateUsed: Number(q.usdRateUsed),
        createdAt: q.createdAt.toISOString(),
        photoIds: photoIdsByQuoteId.get(q.id) ?? [],
        attachedServices: servicesByQuoteId.get(q.id) ?? [],
      }))}
    />
  );
}
