import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { createManagerToken } from "@/lib/manager-tokens";
import { sendManagerPasswordResetEmail } from "@/lib/manager-email";
import { getAppOrigin } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Owner-triggered equivalent of the self-serve /api/manager-forgot-password
// flow — same token type and email, just started by the owner clicking a
// button next to a manager instead of the manager typing their own email.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || session.role !== "owner") {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  const { id } = await params;
  const manager = await prisma.manager.findUnique({ where: { id } });
  if (!manager) return Response.json({ error: "Менеджер не найден." }, { status: 404 });

  const token = await createManagerToken(manager.id, "reset");
  const origin = getAppOrigin(req);
  await sendManagerPasswordResetEmail(manager.email, `${origin}/desk/manager/activate?token=${token}`);

  return Response.json({ ok: true });
}
