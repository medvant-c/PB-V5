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
    select: { name: true, active: true },
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

  return <ManagerWorkspace name={manager.name} role={session.role} impersonatedByName={impersonatedByName} />;
}
