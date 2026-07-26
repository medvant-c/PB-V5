import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { isQuoteStatus } from "@/lib/quote-statuses";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Buyout-fact confirmation only makes sense once the quote has actually
// reached "в доставке на склад" or later — moving status back out of this
// set (mistake, or genuinely reverted) wipes any confirmed fact per the
// agreed policy ("вернуть как было до смены статуса"), rather than leaving
// stale real-money numbers attached to a quote that's no longer there.
const POST_BUYOUT_STATUSES = ["in_transit_to_warehouse", "delivered_to_warehouse", "sent_to_client", "handed_to_client"];

// Separate from the full-edit PATCH on manager-quotes/[id] — the status
// dropdown in the client list changes just this one field, it shouldn't
// have to resend (and re-validate/re-price) the entire quote form.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.quote.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  if (!(await canAccessManagerQuote(session, existing.managerId))) {
    return Response.json({ error: "Нет доступа к этому просчёту." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { status } = (body as { status?: unknown }) ?? {};
  if (typeof status !== "string" || !isQuoteStatus(status)) {
    return Response.json({ error: "Некорректный статус." }, { status: 400 });
  }
  if (status === existing.status) {
    return Response.json({ quote: existing });
  }

  const revertingPastBuyout = existing.buyoutFactConfirmed && !POST_BUYOUT_STATUSES.includes(status);

  const quote = await prisma.quote.update({
    where: { id },
    data: {
      status,
      statusChangedAt: new Date(),
      ...(revertingPastBuyout
        ? {
            actualBuyoutCny: null,
            actualBuyoutRateUsed: null,
            buyoutFactConfirmed: false,
            buyoutConfirmedByManagerId: null,
            buyoutConfirmedAt: null,
            buyoutPremiumRatePercent: null,
          }
        : {}),
    },
  });
  return Response.json({ quote });
}
