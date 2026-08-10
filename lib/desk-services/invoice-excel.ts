import "server-only";
import ExcelJS from "exceljs";

const HEADER_FILL = "FF1F3864"; // dark navy — same palette as quotes-excel.ts
const HEADER_FONT_COLOR = "FFFFFFFF";
const STRIPE_FILL = "FFDCE6F1";

const QUOTE_TYPE_LABEL: Record<string, string> = {
  standard: "Standart",
  expert: "Expert",
  pro: "Pro",
};

const COLUMNS = [
  { header: "№", width: 8 },
  { header: "Просчёт", width: 40 },
  { header: "Тип поиска", width: 14 },
  { header: "Сумма, ₽", width: 14 },
] as const;

interface InvoiceRow {
  displayId: number;
  productName: string;
  quoteType: string;
  searchServiceFeeRub: number;
  searchFeeWaived: boolean;
  // "Производство под заказ" — billed on this same pre-purchase invoice,
  // as its own row right under the quote's Просчёт row (not folded into
  // one amount), since it's a distinct service the client can see billed
  // separately. See Quote.customProductionFeeRub in prisma/schema.prisma
  // and PB-V5 chat 2026-07-30.
  isCustomProduction: boolean;
  customProductionFeeRub: number;
}

// "Счёт на услуги" — bills specifically for the Просчёт (search/calculation)
// service fee per quote, plus "производство под заказ" if flagged (both
// billed/known before any goods are bought), NOT the full order total
// (goods/cargo/buyout get invoiced separately, at buyout time, via Отчёты
// по дням) — a manager generates this after doing the calculation work
// itself, before any goods have actually been bought. See PB-V5 chat
// 2026-07-29, production-fee row added 2026-07-30.
async function renderInvoiceExcel(
  props: { client: { name: string; phone: string | null }; rows: InvoiceRow[] },
): Promise<{ buffer: Buffer; totalRub: number }> {
  const { client, rows } = props;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Panda Bridge";
  const sheet = workbook.addWorksheet(`Счёт — ${client.name}`.slice(0, 31));

  sheet.columns = COLUMNS.map((c) => ({ width: c.width }));

  const titleRow = sheet.addRow(["Счёт на услуги по просчёту"]);
  titleRow.getCell(1).font = { bold: true, size: 14 };
  sheet.addRow([`Клиент: ${client.name}`]);
  sheet.addRow([`Телефон: ${client.phone ?? "—"}`]);
  sheet.addRow([`Дата: ${new Date().toLocaleDateString("ru-RU")}`]);
  sheet.addRow([]);

  const headerRow = sheet.addRow(COLUMNS.map((c) => c.header));
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT_COLOR } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  let totalRub = 0;
  let stripeIndex = 0;
  rows.forEach((row) => {
    const amountRub = row.searchFeeWaived ? 0 : row.searchServiceFeeRub;
    totalRub += amountRub;
    const excelRow = sheet.addRow([
      row.displayId,
      row.productName,
      QUOTE_TYPE_LABEL[row.quoteType] ?? row.quoteType,
      row.searchFeeWaived ? "БЕСПЛАТНО" : Math.round(amountRub),
    ]);
    const stripeFill: ExcelJS.Fill | undefined =
      stripeIndex % 2 === 1 ? { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE_FILL } } : undefined;
    excelRow.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: "middle", wrapText: colNumber === 2 };
      if (stripeFill) cell.fill = stripeFill;
    });
    stripeIndex++;

    if (row.isCustomProduction) {
      totalRub += row.customProductionFeeRub;
      const productionRow = sheet.addRow([
        row.displayId,
        "Производство под заказ",
        QUOTE_TYPE_LABEL[row.quoteType] ?? row.quoteType,
        Math.round(row.customProductionFeeRub),
      ]);
      const productionStripeFill: ExcelJS.Fill | undefined =
        stripeIndex % 2 === 1 ? { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE_FILL } } : undefined;
      productionRow.eachCell((cell, colNumber) => {
        cell.alignment = { vertical: "middle", wrapText: colNumber === 2 };
        cell.font = { italic: true };
        if (productionStripeFill) cell.fill = productionStripeFill;
      });
      stripeIndex++;
    }
  });

  sheet.addRow([]);
  const totalRow = sheet.addRow(["", "", "ИТОГО", Math.round(totalRub)]);
  totalRow.eachCell((cell) => {
    cell.font = { bold: true };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(buffer), totalRub };
}

export { renderInvoiceExcel };
export type { InvoiceRow };
