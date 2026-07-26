import type { Metadata } from "next";
import { ManagerForgotPasswordForm } from "@/components/manager/manager-forgot-password-form";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ManagerForgotPasswordPage() {
  return <ManagerForgotPasswordForm />;
}
