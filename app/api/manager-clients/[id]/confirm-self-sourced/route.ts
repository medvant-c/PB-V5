import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Step 2 of 2 — owner/senior only, and never the same person who claimed
// the client (conflict-of-interest control: the manager who'd earn the 35%
// premium can't be the one who confirms their own claim). Confirming does
// NOT retroactively raise the premium on quotes already confirmed before
// today — see buyoutPremiumRatePercent on Quote, which is locked in at
// each quote's own confirmation time, not recomputed live off this flag.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior") {
    return Response.json(
      { error: "Подтвердить личного клиента может только старший менеджер или руководитель." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    select: { createdByManagerId: true, selfSourcedClaimed: true },
  });
  if (!client) {
    return Response.json({ error: "Клиент не найден." }, { status: 404 });
  }
  if (!client.selfSourcedClaimed) {
    return Response.json({ error: "Менеджер ещё не заявил этого клиента как личного." }, { status: 400 });
  }
  if (client.createdByManagerId === session.managerId) {
    return Response.json({ error: "Нельзя подтвердить собственную заявку." }, { status: 403 });
  }

  const updated = await prisma.client.update({
    where: { id },
    data: {
      selfSourcedConfirmed: true,
      selfSourcedConfirmedAt: new Date(),
      selfSourcedConfirmedByManagerId: session.managerId,
    },
    select: { id: true, selfSourcedConfirmed: true, selfSourcedConfirmedAt: true },
  });

  return Response.json({ client: updated });
}
