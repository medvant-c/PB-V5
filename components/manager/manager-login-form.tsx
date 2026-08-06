"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Briefcase } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

function ManagerLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/manager-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        router.refresh();
      } else {
        setError(data.error ?? "Неверный email или пароль.");
      }
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm items-center px-4">
      <Card className="w-full p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white">
            <Briefcase className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-bold text-text">Кабинет менеджера</div>
            <div className="text-xs text-text-secondary">Клиенты, просчёты и KPI</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="manager-email">Email</Label>
            <Input
              id="manager-email"
              type="email"
              placeholder="you@panda-bridges.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manager-password">Пароль</Label>
            <Input
              id="manager-password"
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <Button type="submit" disabled={submitting || !email || !password} className="w-full">
            {submitting ? "Проверка…" : "Войти"}
          </Button>
        </form>

        <div className="mt-4 flex justify-end text-xs">
          <Link href="/desk/manager/forgot-password" className="text-text-secondary hover:text-primary">
            Забыли пароль?
          </Link>
        </div>
      </Card>
    </div>
  );
}

export { ManagerLoginForm };
