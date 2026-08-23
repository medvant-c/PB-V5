"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, LogIn, Mail, Plus, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface ManagerRecord {
  id: string;
  displayId: number;
  name: string;
  email: string;
  role: "manager" | "senior" | "owner" | "outsource_manager";
  active: boolean;
  canEditTariffs: boolean;
  canViewPriceList: boolean;
  canViewCash: boolean;
  canViewProfitReport: boolean;
  canViewTrash: boolean;
  canViewCargoCost: boolean;
  canViewInvoices: boolean;
  canViewDiscounts: boolean;
  supervisorId: string | null;
  supervisor: { name: string } | null;
  createdAt: string;
}

// Every individually owner-grantable permission (see Manager in
// prisma/schema.prisma) — one flat list drives both the popover checklist
// and the compact "N из 6" summary, so adding a 7th permission later is one
// line here, not a hunt through JSX. Order matches how they'd naturally be
// explained to an owner: tariffs first (oldest, most common grant), then
// each tab, then the one that's not a tab at all (cargo cost).
const PERMISSION_FIELDS: { key: keyof ManagerRecord; label: string; hint: string }[] = [
  { key: "canEditTariffs", label: "Тарифы", hint: "Менять курсы, тарифы карго и комиссию за выкуп" },
  { key: "canViewPriceList", label: "Прайс-лист", hint: "Создавать/менять услуги в прайс-листе" },
  { key: "canViewCash", label: "Касса", hint: "Весь кассовый журнал компании, не только свои сделки" },
  { key: "canViewProfitReport", label: "Отчёт о прибыли", hint: "Видит премии других менеджеров и доли инвесторов" },
  { key: "canViewTrash", label: "Корзина", hint: "Смотреть и восстанавливать удалённые просчёты" },
  { key: "canViewCargoCost", label: "Себестоимость карго", hint: "Реальная закупочная цена и маржа по карго" },
  { key: "canViewInvoices", label: "Выставленные счета", hint: "Весь журнал выставленных счетов компании, не только свои" },
  { key: "canViewDiscounts", label: "Скидки по клиентам", hint: "Отчёт по всем скидкам всех менеджеров, не только своим" },
];

const ROLE_LABEL: Record<ManagerRecord["role"], string> = {
  manager: "Менеджер",
  senior: "Старший менеджер",
  owner: "Руководитель",
  // Same scope/rights as "Менеджер" — только свои клиенты, никаких
  // owner/senior-only действий — только скрыты "Тарифы" и "База данных", и
  // клиентские/просчётные номера в его собственном интерфейсе заменены на
  // локальную нумерацию (№1, №1_1…) вместо сквозного displayId, чтобы он
  // не мог прикинуть общий объём компании. См. ManagerRole.outsource_manager
  // в prisma/schema.prisma.
  outsource_manager: "Менеджер (аутсорсинг)",
};

function ManagerStaffTab() {
  const [managers, setManagers] = useState<ManagerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [permissionsMenuId, setPermissionsMenuId] = useState<string | null>(null);
  const [resetSentId, setResetSentId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showNewForm, setShowNewForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ManagerRecord["role"]>("manager");
  const [supervisorId, setSupervisorId] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/managers");
      const data = await res.json();
      if (res.ok) setManagers(data.managers);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const seniors = managers.filter((m) => m.role === "senior");

  async function patchManager(id: string, patch: Record<string, unknown>) {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/managers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) await load();
      else {
        const data = await res.json().catch(() => null);
        setActionError(data?.error ?? "Не удалось изменить менеджера.");
      }
    } catch {
      setActionError("Не удалось связаться с сервером.");
    } finally {
      setBusyId(null);
    }
  }

  // res.json().catch(() => null) — a non-2xx response isn't guaranteed to
  // have a JSON body (an uncaught server exception renders a plain HTML
  // crash page); without the fallback that throw propagated out of this
  // try with no catch, so setActionError never ran and the delete looked
  // like it silently did nothing (busyId still reset via finally). Found
  // via a real delete that hit exactly this — see the FK comment in
  // app/api/managers/[id]/route.ts. See PB-V5 chat 2026-08-23.
  async function handleDelete(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/managers/${id}`, { method: "DELETE" });
      if (res.ok) await load();
      else {
        const data = await res.json().catch(() => null);
        setActionError(data?.error ?? "Не удалось удалить менеджера.");
      }
    } catch {
      setActionError("Не удалось связаться с сервером.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleResetPassword(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/managers/${id}/reset-password`, { method: "POST" });
      if (res.ok) {
        setResetSentId(id);
        setTimeout(() => setResetSentId(null), 4000);
      }
    } finally {
      setBusyId(null);
    }
  }

  // Secure alternative to "знать пароль" — opens the target manager's own
  // session directly, no password involved. Full navigation (not a fetch +
  // local state update) since the role/tab list genuinely changes.
  async function handleImpersonate(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/managers/${id}/impersonate`, { method: "POST" });
      if (res.ok) {
        window.location.href = "/desk/manager";
        return;
      }
      const data = await res.json();
      setActionError(data.error ?? "Не удалось войти как сотрудник.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role, supervisorId: role === "manager" ? supervisorId || null : null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось создать менеджера.");
        return;
      }
      setName("");
      setEmail("");
      setRole("manager");
      setSupervisorId("");
      setShowNewForm(false);
      await load();
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-text">Сотрудники</h2>
        {!showNewForm && (
          <Button type="button" size="sm" variant="outline" onClick={() => setShowNewForm(true)}>
            <Plus className="h-4 w-4" /> Новый менеджер
          </Button>
        )}
      </div>

      {showNewForm && (
        <form onSubmit={handleCreate} className="space-y-2 rounded-xl border border-dashed border-border p-3">
          <p className="text-xs font-semibold text-text-secondary">Новый менеджер — придёт письмо со ссылкой для установки пароля</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Имя" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Select value={role} onValueChange={(v) => setRole(v as ManagerRecord["role"])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABEL).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {role === "manager" && (
              <Select value={supervisorId} onValueChange={setSupervisorId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Старший менеджер (необязательно)" />
                </SelectTrigger>
                <SelectContent>
                  {seniors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Создать"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewForm(false)}>
              Отмена
            </Button>
          </div>
        </form>
      )}

      {actionError && <p className="text-xs text-error">{actionError}</p>}

      {loading ? (
        <p className="text-sm text-text-secondary">Загрузка…</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Сотрудник</TableHead>
              <TableHead>Роль</TableHead>
              <TableHead>Старший менеджер</TableHead>
              <TableHead>Права</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {managers.map((manager) => (
              <TableRow key={manager.id}>
                <TableCell>
                  <div className="font-medium text-text">
                    №{manager.displayId} {manager.name}
                  </div>
                  <div className="text-xs text-text-secondary">{manager.email}</div>
                </TableCell>
                <TableCell>
                  <Select
                    value={manager.role}
                    onValueChange={(v) => patchManager(manager.id, { role: v })}
                    disabled={busyId === manager.id}
                  >
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABEL).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {manager.role === "manager" ? (
                    <Select
                      value={manager.supervisorId ?? "none"}
                      onValueChange={(v) => patchManager(manager.id, { supervisorId: v === "none" ? null : v })}
                      disabled={busyId === manager.id}
                    >
                      <SelectTrigger className="h-8 w-36 text-xs">
                        <SelectValue placeholder="Не назначен" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Не назначен</SelectItem>
                        {seniors.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-text-secondary">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {manager.role === "owner" ? (
                    <span className="text-xs text-text-secondary">Все права</span>
                  ) : (
                    <Popover
                      open={permissionsMenuId === manager.id}
                      onOpenChange={(open) => setPermissionsMenuId(open ? manager.id : null)}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          disabled={busyId === manager.id}
                          className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
                        >
                          {PERMISSION_FIELDS.filter((f) => manager[f.key]).length} из {PERMISSION_FIELDS.length}
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-72 space-y-2 p-3">
                        <p className="text-xs font-semibold text-text-secondary">
                          Права {manager.name} — обычно определяются ролью, но можно настроить индивидуально
                        </p>
                        <div className="space-y-1.5">
                          {PERMISSION_FIELDS.map((field) => (
                            <label
                              key={field.key}
                              className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-bg"
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={Boolean(manager[field.key])}
                                disabled={busyId === manager.id}
                                onChange={() => patchManager(manager.id, { [field.key]: !manager[field.key] })}
                              />
                              <span>
                                <span className="block font-medium text-text">{field.label}</span>
                                <span className="block text-xs text-text-secondary">{field.hint}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => patchManager(manager.id, { active: !manager.active })}
                    disabled={busyId === manager.id}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                      manager.active
                        ? "border-border text-text-secondary hover:border-error/30 hover:text-error"
                        : "border-success/30 text-success",
                    )}
                  >
                    {busyId === manager.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : manager.active ? (
                      "Активен"
                    ) : (
                      "Заблокирован"
                    )}
                  </button>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {manager.role !== "owner" && (
                      <button
                        type="button"
                        onClick={() => handleImpersonate(manager.id)}
                        disabled={busyId === manager.id}
                        title="Войти в кабинет этого сотрудника без пароля"
                        className="flex items-center gap-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-primary disabled:opacity-50"
                      >
                        <LogIn className="h-3.5 w-3.5" />
                        Войти как
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleResetPassword(manager.id)}
                      disabled={busyId === manager.id}
                      className="flex items-center gap-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-primary disabled:opacity-50"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {resetSentId === manager.id ? "Письмо отправлено" : "Сбросить пароль"}
                    </button>
                    {manager.role !== "owner" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            type="button"
                            disabled={busyId === manager.id}
                            className="flex items-center gap-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-error disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Удалить
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Удалить сотрудника {manager.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Все его клиенты и просчёты (со всей историей и показателями) перейдут к вам —
                              ничего не удалится и не потеряется. Сам аккаунт сотрудника будет удалён без
                              возможности восстановления.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                            <AlertDialogAction variant="danger" onClick={() => handleDelete(manager.id)}>
                              Удалить
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export { ManagerStaffTab };
