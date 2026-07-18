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

  return (
    <AccountDashboard
      orders={orders.map((order) => ({
        ...order,
        createdAt: order.createdAt.toISOString(),
        events: order.events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
      }))}
      documents={documents.map((doc) => ({ ...doc, uploadedAt: doc.uploadedAt.toISOString() }))}
    />
  );
}
