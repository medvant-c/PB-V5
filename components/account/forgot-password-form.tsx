"use client";

import { useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/account-forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setMessage(data.message ?? "Если этот email зарегистрирован, мы отправили на него ссылку для сброса пароля.");
    } catch {
      setMessage("Не удалось связаться с сервером.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm items-center px-4">
      <Card className="w-full p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white">
            <Mail className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-bold text-text">Восстановление пароля</div>
            <div className="text-xs text-text-secondary">Пришлём ссылку на email</div>
          </div>
        </div>

        {message ? (
          <p className="mt-6 text-sm text-text-secondary">{message}</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoFocus
                required
              />
            </div>
            <Button type="submit" disabled={submitting || !email} className="w-full">
              {submitting ? "Отправка…" : "Отправить ссылку"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

export { ForgotPasswordForm };
