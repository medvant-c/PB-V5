import type { Metadata } from "next";
import { ManagerSetPasswordForm } from "@/components/manager/manager-set-password-form";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ActivateManagerPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  return <ManagerSetPasswordForm token={token ?? null} />;
}
