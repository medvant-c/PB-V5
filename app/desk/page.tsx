import type { Metadata } from "next";
import { cookies } from "next/headers";
import { COOKIE_NAME, verifyDeskSessionToken } from "@/lib/desk-auth";
import { DeskLoginForm } from "@/components/desk/desk-login-form";
import { DeskWorkspace } from "@/components/desk/desk-workspace";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DeskPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const isAuthenticated = token ? await verifyDeskSessionToken(token) : false;

  if (!isAuthenticated) {
    return <DeskLoginForm />;
  }

  return <DeskWorkspace />;
}
