import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// The missing "undo" for confirm-self-sourced/route.ts — до сих пор не
// было пути назад после подтверждения (только reject-self-sourced, а он
// работает лишь для ЗАЯВЛЕННОГО, но ещё не подтверждённого статуса, и
// явно отказывает с 400, если selfSourcedConfirmed уже true). Сбрасывает
// полностью в "никогда не заявлялся", как и reject-self-sourced — тем же
// путём клиента снова можно будет заявить как личного позже, если это
// было ошибкой лишь отчасти. Owner/senior-only, тот же гейт, что и у
// confirm. НЕ пересчитывает задним числом премию по уже подтверждённым
// просчётам — buyoutSelfSourcedBoost заморожен на каждом просчёте в
// момент его собственного подтверждения, не читается живьём с этого
// флага (см. комментарий в confirm-self-sourced/route.ts). См. PB-V5 chat
// 2026-08-23.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior") {
    return Response.json(
      { error: "Снять статус личного клиента может только старший менеджер или руководитель." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id }, select: { selfSourcedConfirmed: true } });
  if (!client) {
    return Response.json({ error: "Клиент не найден." }, { status: 404 });
  }
  if (!client.selfSourcedConfirmed) {
    return Response.json({ error: "Этот клиент ещё не подтверждён как личный." }, { status: 400 });
  }

  const updated = await prisma.client.update({
    where: { id },
    data: {
      selfSourcedClaimed: false,
      selfSourcedClaimedAt: null,
      selfSourcedConfirmed: false,
      selfSourcedConfirmedAt: null,
      selfSourcedConfirmedByManagerId: null,
    },
    select: { id: true, selfSourcedConfirmed: true },
  });

  return Response.json({ client: updated });
}
