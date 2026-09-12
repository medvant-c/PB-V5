// One-time (re-runnable): реклассификация существующего каталога услуг
// фулфилмента на два прайс-листа — "item" (к товару, дефолт для всех) и
// "order" (к заявке целиком — короба/места/хранение, результат которых
// известен только после обработки товара). Явный список ниже — только
// строки, которые ДОЛЖНЫ стать "order", остальные остаются "item" по
// умолчанию схемы. Безопасно перезапускать. Запуск:
//   npx tsx prisma/migrate-fulfillment-service-scope.ts
// См. PB-V5 chat 2026-09-12.
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DESK_DATABASE_URL! }),
});

const ORDER_SCOPE_NAMES = [
  "Хранение (1 м³ — бесплатно)",
  "Дополнительное хранение (¥/м³/мес)",
  "Маркировка транспортного короба (¥/короб)",
  "Маркировка грузового места (¥/место)",
  "Формирование транспортного короба, наш короб (¥/короб)",
  "Формирование транспортного короба, короб клиента (¥/короб)",
  "Формирование короба, наш короб (FBO)",
];

async function main() {
  let updated = 0;
  for (const name of ORDER_SCOPE_NAMES) {
    const result = await prisma.fulfillmentServiceItem.updateMany({ where: { name }, data: { scope: "order" } });
    updated += result.count;
    if (result.count > 0) console.log(`"${name}" → order`);
  }
  console.log(`Итого переклассифицировано в "order": ${updated}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
