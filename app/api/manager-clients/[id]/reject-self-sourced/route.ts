import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// The other half of confirm-self-sourced — lets senior/owner decline a
// claim (e.g. a manager clicked "Заявить как личного клиента" by mistake)
// instead of leaving it stuck in the queue forever with only "Подтвердить"
// as an option. Resets back to "never claimed" rather than a separate
// "rejected" state — the manager can just claim it again for real later if
// this really was a mistake.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior") {
    return Response.json(
      { error: "Отклонить заявку может только старший менеджер или руководитель." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id }, select: { selfSourcedClaimed: true } });
  if (!client) {
    return Response.json({ error: "Клиент не найден." }, { status: 404 });
  }
  if (!client.selfSourcedClaimed) {
    return Response.json({ error: "Менеджер ещё не заявил этого клиента как личного." }, { status: 400 });
  }

  const updated = await prisma.client.update({
    where: { id },
    data: { selfSourcedClaimed: false, selfSourcedClaimedAt: null },
    select: { id: true, selfSourcedClaimed: true },
  });

  return Response.json({ client: updated });
}
