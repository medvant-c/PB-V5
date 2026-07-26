import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Step 1 of 2 — the manager who created this client claims they personally
// sourced it (as opposed to an inbound/marketing lead). Only the creator
// can claim; this alone grants nothing — it just puts the client into the
// owner/senior confirmation queue instead of that queue listing every
// client ever created.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id }, select: { createdByManagerId: true } });
  if (!client) {
    return Response.json({ error: "Клиент не найден." }, { status: 404 });
  }
  if (client.createdByManagerId !== session.managerId) {
    return Response.json({ error: "Заявить клиента как личного может только тот, кто его создал." }, { status: 403 });
  }

  const updated = await prisma.client.update({
    where: { id },
    data: { selfSourcedClaimed: true, selfSourcedClaimedAt: new Date() },
    select: { id: true, selfSourcedClaimed: true, selfSourcedClaimedAt: true },
  });

  return Response.json({ client: updated });
}
