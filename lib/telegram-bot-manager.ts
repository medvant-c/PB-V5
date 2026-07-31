import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { nextManagerDisplayId } from "@/lib/display-ids";

const TELEGRAM_BOT_EMAIL = "telegram-bot@panda-bridges.internal";

// TariffSettings.createdByManagerId is a required FK (see
// prisma/schema.prisma) — a real Manager account is needed to attribute a
// rate update the Telegram webhook makes with no human session behind it,
// so it's visible/auditable in tariff history the same way any manager's
// edit would be, rather than working around the constraint. Never logs
// in (random unusable password, `active: true` only so it isn't quietly
// excluded from anything that filters on that). Created once, reused
// after. See app/api/telegram-cny-rate-webhook/route.ts and PB-V5 chat
// 2026-07-31.
async function getOrCreateTelegramBotManagerId(): Promise<string> {
  const existing = await prisma.manager.findUnique({ where: { email: TELEGRAM_BOT_EMAIL }, select: { id: true } });
  if (existing) return existing.id;

  const created = await prisma.manager.create({
    data: {
      displayId: await nextManagerDisplayId(),
      email: TELEGRAM_BOT_EMAIL,
      name: "Telegram-бот (курс юаня)",
      role: "manager",
      active: true,
      passwordHash: hashPassword(randomUUID()),
    },
    select: { id: true },
  });
  return created.id;
}

export { getOrCreateTelegramBotManagerId };
