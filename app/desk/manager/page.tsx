import type { Metadata } from "next";
import { cookies } from "next/headers";
import { COOKIE_NAME, verifyManagerSessionToken } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";
import { ManagerLoginForm } from "@/components/manager/manager-login-form";
import { ManagerWorkspace } from "@/components/manager/manager-workspace";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ManagerCabinetPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const session = token ? await verifyManagerSessionToken(token) : null;

  if (!session) {
    return <ManagerLoginForm />;
  }

  // The session cookie can outlive a deactivation (12h) — re-check live
  // rather than trust the token alone, same reasoning as /account.
  const manager = await prisma.manager.findUnique({
    where: { id: session.managerId },
    select: {
      name: true,
      active: true,
      canViewPriceList: true,
      canViewCash: true,
      canViewProfitReport: true,
      canViewTrash: true,
      canViewInvoices: true,
      canViewDiscounts: true,
    },
  });
  if (!manager || !manager.active) {
    return <ManagerLoginForm />;
  }

  // Impersonated session ("Войти как сотрудник") — resolve the original
  // owner's name for the workspace's "you're viewing as X" banner. Falls
  // back to treating this as a normal session if that owner account is
  // somehow gone (deleted since impersonating) rather than erroring out.
  let impersonatedByName: string | null = null;
  if (session.impersonatedBy) {
    const owner = await prisma.manager.findUnique({ where: { id: session.impersonatedBy }, select: { name: true } });
    impersonatedByName = owner?.name ?? null;
  }

  // Owner always has every individually-grantable permission regardless of
  // the stored (default-false) column value — see lib/manager-scope.ts's
  // hasManagerPermission for the same "owner always" rule enforced
  // server-side on every API route; this just needs to match it so the
  // owner's own nav isn't missing tabs their own account's row never had a
  // reason to have `true` on.
  const isOwner = session.role === "owner";
  return (
    <ManagerWorkspace
      name={manager.name}
      role={session.role}
      impersonatedByName={impersonatedByName}
      permissions={{
        canViewPriceList: isOwner || manager.canViewPriceList,
        canViewCash: isOwner || manager.canViewCash,
        canViewProfitReport: isOwner || manager.canViewProfitReport,
        canViewTrash: isOwner || manager.canViewTrash,
        canViewInvoices: isOwner || manager.canViewInvoices,
        canViewDiscounts: isOwner || manager.canViewDiscounts,
      }}
    />
  );
}
