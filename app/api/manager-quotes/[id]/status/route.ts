import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { isQuoteStatus } from "@/lib/quote-statuses";
import { BUYOUT_REVERT_DATA, stripCargoCostForNonOwner } from "@/lib/desk-services/quote-request";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Buyout-fact confirmation only makes sense once the quote has actually
// reached "в доставке на склад" or later — moving status back out of this
// set (mistake, or genuinely reverted) wipes any confirmed fact per the
// agreed policy ("вернуть как было до смены статуса"), rather than leaving
// stale real-money numbers attached to a quote that's no longer there.
const POST_BUYOUT_STATUSES = ["in_transit_to_warehouse", "delivered_to_warehouse", "sent_to_client", "handed_to_client"];

// Cargo must be actualized (real weight/volume from the warehouse) before
// reaching either of these — hard block, unlike buyout facts, since there's
// no confirmation gate to route around it through.
const CARGO_ACTUALIZATION_REQUIRED_STATUSES = ["sent_to_client", "handed_to_client"];

// Separate from the full-edit PATCH on manager-quotes/[id] — the status
// dropdown in the client list changes just this one field, it shouldn't
// have to resend (and re-validate/re-price) the entire quote form.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.quote.findUnique({ where: { id }, include: { client: true } });
  if (!existing || existing.deletedAt) return Response.json({ error: "Просчёт не найден." }, { status: 404 });
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

  if (CARGO_ACTUALIZATION_REQUIRED_STATUSES.includes(status) && !existing.cargoActualizedAt) {
    return Response.json(
      { error: "Сначала внесите реальные габариты и вес карго с накладной кладовщика.", code: "CARGO_NOT_ACTUALIZED" },
      { status: 400 },
    );
  }

  const revertingPastBuyout = existing.buyoutFactConfirmed && !POST_BUYOUT_STATUSES.includes(status);
  const revertingPastCargoActualization = existing.cargoActualizedAt && !CARGO_ACTUALIZATION_REQUIRED_STATUSES.includes(status);
  const revertingPastHandedToClient = existing.cargoBonusRatePercent !== null && status !== "handed_to_client";

  // Freshly reaching handed_to_client — freeze whether this quote's cargo
  // bonus applies (self-sourced client, quote still owned by that same
  // manager) at THIS moment, same reasoning as buyoutPremiumRatePercent:
  // never recomputed live off Client.selfSourcedConfirmed later.
  let cargoBonusRatePercent: number | null | undefined;
  if (status === "handed_to_client" && existing.cargoBonusRatePercent === null) {
    const isSelfSourced = existing.client.selfSourcedConfirmed && existing.client.createdByManagerId === existing.managerId;
    cargoBonusRatePercent = isSelfSourced ? 10 : 0;
  }

  // The client-payment CashOrder was created BECAUSE of this confirmation
  // — reverting the confirmation removes it too, rather than leaving an
  // orphaned cash-ledger entry with no backing quote confirmation.
  if (revertingPastBuyout && existing.clientPaymentCashOrderId) {
    await prisma.cashOrder.delete({ where: { id: existing.clientPaymentCashOrderId } });
  }

  const quote = await prisma.quote.update({
    where: { id },
    data: {
      status,
      statusChangedAt: new Date(),
      // Set once, forever — never overwritten by a later status change in
      // either direction. Drives "готовые просчёты за день/неделю/месяц" on
      // the dashboard (see PB-V5 chat 2026-07-28): the manager did the
      // calculation work the moment this was first true.
      ...(status === "pending_approval" && !existing.completedAt ? { completedAt: new Date() } : {}),
      ...(revertingPastBuyout ? BUYOUT_REVERT_DATA : {}),
      ...(revertingPastCargoActualization
        ? {
            // Restore every field actualize-cargo overwrote back to what
            // was originally quoted, then clear the actual/estimated
            // tracking fields themselves.
            totalWeightKg: existing.estimatedTotalWeightKg!,
            totalVolumeM3: existing.estimatedTotalVolumeM3!,
            densityKgM3: existing.estimatedDensityKgM3!,
            cargoDeliveryUsd: existing.estimatedCargoDeliveryUsd!,
            cargoDeliveryRub: existing.estimatedCargoDeliveryRub!,
            cargoCostUsd: existing.estimatedCargoCostUsd!,
            cargoCostRub: existing.estimatedCargoCostRub!,
            totalRub: existing.estimatedTotalRub!,
            actualTotalWeightKg: null,
            actualTotalVolumeM3: null,
            estimatedTotalWeightKg: null,
            estimatedTotalVolumeM3: null,
            estimatedDensityKgM3: null,
            estimatedCargoDeliveryUsd: null,
            estimatedCargoDeliveryRub: null,
            estimatedCargoCostUsd: null,
            estimatedCargoCostRub: null,
            estimatedTotalRub: null,
            cargoActualizedAt: null,
            cargoActualizedByManagerId: null,
          }
        : {}),
      ...(revertingPastHandedToClient ? { cargoBonusRatePercent: null } : {}),
      ...(cargoBonusRatePercent !== undefined ? { cargoBonusRatePercent } : {}),
    },
  });
  return Response.json({ quote: stripCargoCostForNonOwner(quote, session) });
}
