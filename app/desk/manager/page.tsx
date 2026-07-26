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

  return <ManagerWorkspace name={manager.name} role={session.role} />;
}
