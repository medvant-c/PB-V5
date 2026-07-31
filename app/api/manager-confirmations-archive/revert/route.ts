import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";
import { BUYOUT_REVERT_DATA } from "@/lib/desk-services/quote-request";

// "Delete a confirmation" / "edit a confirmation" from the archive are the
// same action: revert it back to unconfirmed. That drops it straight back
// into the pending queue (confirmations-tab.tsx's main section) — leave it
// there to genuinely remove the confirmation, or fix the numbers and
// re-confirm through the exact same form that confirmed it the first time,
// no separate edit UI needed. See PB-V5 chat 2026-07-30 and
// app/api/manager-confirmations-archive/route.ts for the combined list
// this reverts an entry out of.
export async function PATCH(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior") {
    return Response.json({ error: "Доступно только старшему менеджеру и руководителю." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { type, id } = (body as { type?: unknown; id?: unknown }) ?? {};
  if (typeof id !== "string" || !id) {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  if (type === "buyout") {
    const quote = await prisma.quote.findUnique({ where: { id }, select: { buyoutFactConfirmed: true, clientPaymentCashOrderId: true } });
    if (!quote) return Response.json({ error: "Просчёт не найден." }, { status: 404 });
    if (!quote.buyoutFactConfirmed) return Response.json({ error: "Факт по выкупу не подтверждён." }, { status: 400 });
    if (quote.clientPaymentCashOrderId) {
      await prisma.cashOrder.delete({ where: { id: quote.clientPaymentCashOrderId } });
    }
    await prisma.quote.update({ where: { id }, data: BUYOUT_REVERT_DATA });
    return Response.json({ ok: true });
  }

  if (type === "cargo_rate") {
    const quote = await prisma.quote.findUnique({ where: { id }, select: { cargoRateOverrideConfirmed: true } });
    if (!quote) return Response.json({ error: "Просчёт не найден." }, { status: 404 });
    if (!quote.cargoRateOverrideConfirmed) return Response.json({ error: "Ставка карго не подтверждена." }, { status: 400 });
    await prisma.quote.update({
      where: { id },
      data: {
        cargoRateOverrideConfirmed: false,
        cargoRateOverrideCostUsd: null,
        cargoRateOverrideConfirmedByManagerId: null,
        cargoRateOverrideConfirmedAt: null,
      },
    });
    return Response.json({ ok: true });
  }

  if (type === "cny_rate") {
    const quote = await prisma.quote.findUnique({ where: { id }, select: { cnyRateOverrideConfirmed: true } });
    if (!quote) return Response.json({ error: "Просчёт не найден." }, { status: 404 });
    if (!quote.cnyRateOverrideConfirmed) return Response.json({ error: "Курс юаня не подтверждён." }, { status: 400 });
    await prisma.quote.update({
      where: { id },
      data: { cnyRateOverrideConfirmed: false, cnyRateOverrideConfirmedByManagerId: null, cnyRateOverrideConfirmedAt: null },
    });
    return Response.json({ ok: true });
  }

  if (type === "buyout_commission") {
    const quote = await prisma.quote.findUnique({ where: { id }, select: { buyoutCommissionOverrideConfirmed: true } });
    if (!quote) return Response.json({ error: "Просчёт не найден." }, { status: 404 });
    if (!quote.buyoutCommissionOverrideConfirmed) return Response.json({ error: "Комиссия за выкуп не подтверждена." }, { status: 400 });
    await prisma.quote.update({
      where: { id },
      data: {
        buyoutCommissionOverrideConfirmed: false,
        buyoutCommissionOverrideConfirmedByManagerId: null,
        buyoutCommissionOverrideConfirmedAt: null,
      },
    });
    return Response.json({ ok: true });
  }

  if (type === "self_sourced_client") {
    const client = await prisma.client.findUnique({ where: { id }, select: { selfSourcedConfirmed: true } });
    if (!client) return Response.json({ error: "Клиент не найден." }, { status: 404 });
    if (!client.selfSourcedConfirmed) return Response.json({ error: "Клиент не подтверждён как личный." }, { status: 400 });
    // Claim itself (selfSourcedClaimed) stays — reverting drops it back
    // into the pending queue for re-confirmation, not all the way back to
    // "never claimed" (that's what "Отклонить" in the pending queue is
    // for).
    await prisma.client.update({
      where: { id },
      data: { selfSourcedConfirmed: false, selfSourcedConfirmedByManagerId: null, selfSourcedConfirmedAt: null },
    });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Некорректный тип подтверждения." }, { status: 400 });
}
