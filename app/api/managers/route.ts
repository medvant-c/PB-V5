import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { createManagerToken } from "@/lib/manager-tokens";
import { sendManagerActivationEmail } from "@/lib/manager-email";
import { getAppOrigin } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";
import { nextManagerDisplayId } from "@/lib/display-ids";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = ["manager", "senior", "owner", "outsource_manager"];

// Everything under /api/managers is owner-only — this is staff
// administration (create accounts, see everyone's role/status), not
// something a plain manager or even a senior manager should reach.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || session.role !== "owner") {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  const managers = await prisma.manager.findMany({
    orderBy: { displayId: "asc" },
    select: {
      id: true,
      displayId: true,
      name: true,
      email: true,
      role: true,
      active: true,
      canEditTariffs: true,
      canViewPriceList: true,
      canViewCash: true,
      canViewProfitReport: true,
      canViewTrash: true,
      canViewCargoCost: true,
      canViewInvoices: true,
      canViewDiscounts: true,
      supervisorId: true,
      supervisor: { select: { name: true } },
      createdAt: true,
    },
  });
  return Response.json({ managers });
}

export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || session.role !== "owner") {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const { name, email, role, supervisorId } =
    (body as { name?: unknown; email?: unknown; role?: unknown; supervisorId?: unknown }) ?? {};

  if (typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "Укажите имя." }, { status: 400 });
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return Response.json({ error: "Укажите корректный email." }, { status: 400 });
  }
  if (typeof role !== "string" || !VALID_ROLES.includes(role)) {
    return Response.json({ error: "Укажите роль." }, { status: 400 });
  }
  const normalizedSupervisorId = typeof supervisorId === "string" && supervisorId ? supervisorId : null;
  if (normalizedSupervisorId) {
    const supervisor = await prisma.manager.findUnique({ where: { id: normalizedSupervisorId } });
    if (!supervisor || supervisor.role !== "senior") {
      return Response.json({ error: "Руководитель должен быть старшим менеджером." }, { status: 400 });
    }
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.manager.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return Response.json({ error: "Менеджер с таким email уже существует." }, { status: 409 });
  }

  const manager = await prisma.manager.create({
    data: {
      displayId: await nextManagerDisplayId(),
      name: name.trim(),
      email: normalizedEmail,
      role: role as "manager" | "senior" | "owner" | "outsource_manager",
      supervisorId: normalizedSupervisorId,
    },
  });

  const token = await createManagerToken(manager.id, "activate");
  const origin = getAppOrigin(req);
  await sendManagerActivationEmail(manager.email, manager.name, `${origin}/desk/manager/activate?token=${token}`);

  return Response.json({ manager }, { status: 201 });
}
