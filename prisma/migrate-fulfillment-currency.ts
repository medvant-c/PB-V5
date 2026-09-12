// One-time (re-runnable) migration: fulfillment получает ¥ как основную
// валюту (priceCny) на FulfillmentServiceItem/FulfillmentOrderItemService,
// и заморозку курса на FulfillmentOrder.cnyRateUsed. Существующие строки
// (на момент написания — 7 услуг в каталоге, 3 строки услуг на позициях,
// 2 заказа) знают только priceRub/totalRub — исторического курса на
// момент их создания у нас нет, поэтому используем ТЕКУЩИЙ курс
// TariffSettings.cnyRateRub как приближение (это просто цена прайс-листа
// для показа, ни на что финансовое уже не влияет — totalRub на старых
// заказах не пересчитывается). Raw SQL по той же причине, что и в
// migrate-cash-accounts.ts — поля временно nullable, чтобы можно было
// запустить бэкфилл ДО того как они станут required вторым db push.
// Безопасно перезапускать: трогает только строки с priceCny/cnyRateUsed
// IS NULL. Запуск:
//   npx tsx prisma/migrate-fulfillment-currency.ts
// См. PB-V5 chat 2026-09-11.
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DESK_DATABASE_URL! }),
});

async function main() {
  const tariff = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
  const rate = tariff ? Number(tariff.cnyRateRub) : null;
  if (!rate || rate <= 0) {
    throw new Error("Не найден действующий курс юаня (TariffSettings.cnyRateRub) — бэкфилл остановлен.");
  }
  console.log(`Используемый курс ¥→₽: ${rate}`);

  const servicesUpdated = await prisma.$executeRawUnsafe(
    `UPDATE "FulfillmentServiceItem" SET "priceCny" = "priceRub" / ? WHERE "priceCny" IS NULL`,
    rate,
  );
  console.log(`FulfillmentServiceItem: заполнено priceCny у ${servicesUpdated} строк(и)`);

  const itemServicesUpdated = await prisma.$executeRawUnsafe(
    `UPDATE "FulfillmentOrderItemService" SET "priceCny" = "priceRub" / ? WHERE "priceCny" IS NULL`,
    rate,
  );
  console.log(`FulfillmentOrderItemService: заполнено priceCny у ${itemServicesUpdated} строк(и)`);

  const ordersUpdated = await prisma.$executeRawUnsafe(
    `UPDATE "FulfillmentOrder" SET "cnyRateUsed" = ? WHERE "cnyRateUsed" IS NULL`,
    rate,
  );
  console.log(`FulfillmentOrder: заполнено cnyRateUsed у ${ordersUpdated} заказ(ов)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
