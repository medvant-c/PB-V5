import type { Metadata } from "next";
import { SetPasswordForm } from "@/components/account/set-password-form";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ActivateAccountPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  return <SetPasswordForm token={token ?? null} />;
}
