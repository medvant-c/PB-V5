import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseCnyRateMessage } from "@/lib/telegram-cny-rate";
import { getOrCreateTelegramBotManagerId } from "@/lib/telegram-bot-manager";

// Telegram calls this directly (no manager session — this is the only
// route in the app authenticated by a shared secret instead of a login).
// Registered once via Telegram's setWebhook API with `secret_token` set to
// TELEGRAM_WEBHOOK_SECRET; Telegram echoes it back on every call as this
// header, which is the only thing standing between this endpoint and
// anyone who finds the URL.
//
// Stores ALL FOUR volume tiers the group posts (see TariffSettings.
// cnyRateRub/cnyRateRubTier3000/10000/30000), not just one flat rate —
// which specific tier actually prices a given quote is decided per-quote
// by pickCnyRateForTotal in lib/quote-engine.ts, based on that quote's own
// ¥ total, not fixed here. Applied automatically (a new TariffSettings row
// the moment a valid message arrives), never touching already-issued
// quotes — the existing "TariffSettings is append-only, a quote freezes
// its own rate at creation" design already guarantees that for free. See
// PB-V5 chat 2026-07-31.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let update: unknown;
  try {
    update = await req.json();
  } catch {
    // Telegram doesn't retry/care about our response body — just avoid a
    // 500 for a malformed payload so it doesn't get flagged as failing.
    return Response.json({ ok: true });
  }

  // The rates are posted in a channel, not a group — Telegram delivers
  // those as `channel_post`, not `message` (that shape is for regular
  // chats/groups). The bot has to be a channel *administrator* to receive
  // channel_post updates at all; there's no privacy-mode toggle for
  // channels the way there is for groups. Checking both keeps this working
  // if the source ever moves to a group instead.
  const body = update as { message?: { text?: unknown }; channel_post?: { text?: unknown } };
  const text = body?.channel_post?.text ?? body?.message?.text;
  if (typeof text !== "string") {
    return Response.json({ ok: true });
  }

  const parsed = parseCnyRateMessage(text);
  if (!parsed) {
    // Most messages in the group aren't a rate post at all — not an
    // error, just nothing to do.
    return Response.json({ ok: true });
  }

  if (parsed.error || parsed.rateFrom1000 === null) {
    await prisma.telegramCnyRateUpdate.create({
      data: {
        rateFrom1000: parsed.rateFrom1000,
        rateFrom3000: parsed.rateFrom3000,
        rateFrom10000: parsed.rateFrom10000,
        rateFrom30000: parsed.rateFrom30000,
        parseError: parsed.error,
        rawMessage: text,
      },
    });
    return Response.json({ ok: true });
  }

  const currentTariffs = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
  if (!currentTariffs) {
    await prisma.telegramCnyRateUpdate.create({
      data: {
        rateFrom1000: parsed.rateFrom1000,
        rateFrom3000: parsed.rateFrom3000,
        rateFrom10000: parsed.rateFrom10000,
        rateFrom30000: parsed.rateFrom30000,
        parseError: "Тарифы ещё не заданы в системе — заполните вкладку «Тарифы» перед первым автообновлением.",
        rawMessage: text,
      },
    });
    return Response.json({ ok: true });
  }

  // Every other field carries over unchanged — only the ¥ rate tiers move.
  // Same append-only convention as a manager saving the Тарифы form
  // themselves (see app/api/manager-tariffs/route.ts): an already-issued
  // quote already has its own frozen cnyRateUsed and is never touched by
  // this new row appearing.
  const botManagerId = await getOrCreateTelegramBotManagerId();
  const newTariffs = await prisma.tariffSettings.create({
    data: {
      cnyRateRub: parsed.rateFrom1000,
      cnyRateRubTier3000: parsed.rateFrom3000,
      cnyRateRubTier10000: parsed.rateFrom10000,
      cnyRateRubTier30000: parsed.rateFrom30000,
      usdRateRub: currentTariffs.usdRateRub,
      volumeRateUsdPerCbm: currentTariffs.volumeRateUsdPerCbm,
      standardPriceRub: currentTariffs.standardPriceRub,
      expertPriceRub: currentTariffs.expertPriceRub,
      proPriceRub: currentTariffs.proPriceRub,
      customProductionStandardRub: currentTariffs.customProductionStandardRub,
      customProductionExpertRub: currentTariffs.customProductionExpertRub,
      customProductionProRub: currentTariffs.customProductionProRub,
      managerCargoRateUsdPerKg: currentTariffs.managerCargoRateUsdPerKg,
      managerCargoRateUsdPerM3: currentTariffs.managerCargoRateUsdPerM3,
      cargoDensityMarginUsdPerKg: currentTariffs.cargoDensityMarginUsdPerKg,
      cargoVolumeMarginUsdPerCbm: currentTariffs.cargoVolumeMarginUsdPerCbm,
      createdByManagerId: botManagerId,
    },
  });

  await prisma.telegramCnyRateUpdate.create({
    data: {
      rateFrom1000: parsed.rateFrom1000,
      rateFrom3000: parsed.rateFrom3000,
      rateFrom10000: parsed.rateFrom10000,
      rateFrom30000: parsed.rateFrom30000,
      appliedRateRub: parsed.rateFrom1000,
      tariffSettingsId: newTariffs.id,
      rawMessage: text,
    },
  });

  return Response.json({ ok: true });
}
