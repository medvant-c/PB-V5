import type { Metadata } from "next";
import { AccountRegisterForm } from "@/components/account/account-register-form";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return <AccountRegisterForm />;
}
