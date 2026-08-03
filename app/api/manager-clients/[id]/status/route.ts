import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerClient } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { isClientStatus } from "@/lib/client-statuses";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Separate from the full-edit PATCH on manager-clients/[id] — same
// "just this one field" reasoning as manager-quotes/[id]/status/route.ts,
// minus that route's lifecycle side effects (buyout-fact reverts, cargo
// actualization, etc.) — Client.status is a plain manual dropdown with no
// downstream consequences elsewhere in the app.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Клиент не найден." }, { status: 404 });
  }
  if (!(await canAccessManagerClient(session, existing))) {
    return Response.json({ error: "Этот клиент вне вашей зоны видимости." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { status } = (body as { status?: unknown }) ?? {};
  if (typeof status !== "string" || !isClientStatus(status)) {
    return Response.json({ error: "Некорректный статус." }, { status: 400 });
  }

  const client = await prisma.client.update({ where: { id }, data: { status } });
  return Response.json({ client });
}
