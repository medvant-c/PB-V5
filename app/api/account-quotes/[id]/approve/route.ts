import { NextRequest } from "next/server";
import { getClientIdFromRequest } from "@/lib/client-auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// The one status change a client can make themselves — approving a quote
// that's "На согласовании" moves it to "Согласовано клиентом". Deliberately
// narrow: only that exact transition is allowed (not an arbitrary status
// field), so a client can never skip ahead in the pipeline or revert
// something a manager already progressed. See PB-V5 chat 2026-07-29.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const clientId = await getClientIdFromRequest(req);
  if (!clientId) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote || quote.clientId !== clientId) {
    return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  }
  if (quote.status !== "pending_approval") {
    return Response.json({ error: "Этот просчёт сейчас нельзя согласовать." }, { status: 400 });
  }

  const updated = await prisma.quote.update({
    where: { id },
    data: { status: "approved_by_client", statusChangedAt: new Date() },
  });

  return Response.json({ status: updated.status });
}
