import "server-only";
import ExcelJS from "exceljs";

const HEADER_FILL = "FF1F3864"; // dark navy — same convention as quotes-excel.ts
const HEADER_FONT_COLOR = "FFFFFFFF";
const TITLE_FONT_COLOR = "FF1F3864";
const INCOME_FILL = "FFE2F0D9"; // light green
const EXPENSE_FILL = "FFFBE2E2"; // light red
const CLOSING_BALANCE_FILL = "FFDCE6F1"; // light blue — same as quotes-excel.ts's stripe

const CURRENCY_LABEL: Record<string, string> = { cny: "¥", usd: "$", rub: "₽" };
const TYPE_LABEL: Record<string, string> = { income: "Приход", expense: "Расход" };

interface CategoryBreakdownRow {
  name: string;
  type: "income" | "expense";
  totalCny: number;
}

interface CashOrderExcelRow {
  date: Date;
  type: "income" | "expense";
  categoryName: string;
  clientName: string | null;
  amount: number;
  currency: string;
  cnyToCurrencyRate: number;
  amountCny: number;
  comment: string;
  createdByName: string;
}

interface RenderCashReportProps {
  monthLabel: string;
  openingBalanceCny: number;
  incomeCny: number;
  expenseCny: number;
  closingBalanceCny: number;
  categoryBreakdown: CategoryBreakdownRow[];
  orders: CashOrderExcelRow[];
}

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildSummarySheet(workbook: ExcelJS.Workbook, props: RenderCashReportProps) {
  const sheet = workbook.addWorksheet("Свод");
  sheet.columns = [{ width: 40 }, { width: 18 }];

  const titleRow = sheet.addRow([`Кассовый отчёт — ${props.monthLabel}`]);
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: TITLE_FONT_COLOR } };
  sheet.addRow([]);

  const openingRow = sheet.addRow(["Баланс на начало периода, ¥", money(props.openingBalanceCny)]);
  openingRow.getCell(1).font = { bold: true };
  openingRow.getCell(2).font = { bold: true };
  sheet.addRow([]);

  function addCategoryTable(type: "income" | "expense", label: string, totalLabel: string, total: number) {
    const header = sheet.addRow([label, "Сумма, ¥"]);
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: HEADER_FONT_COLOR } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    });
    const rows = props.categoryBreakdown.filter((c) => c.type === type);
    if (rows.length === 0) {
      sheet.addRow(["— операций не было —", 0]);
    }
    for (const row of rows) {
      sheet.addRow([row.name, money(row.totalCny)]);
    }
    const totalRow = sheet.addRow([totalLabel, money(total)]);
    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
    });
    sheet.addRow([]);
  }

  addCategoryTable("income", "Статья прихода", "Итого приход", props.incomeCny);
  addCategoryTable("expense", "Статья расхода", "Итого расход", props.expenseCny);

  const closingRow = sheet.addRow(["Баланс на конец периода, ¥", money(props.closingBalanceCny)]);
  closingRow.eachCell((cell) => {
    cell.font = { bold: true, size: 12 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CLOSING_BALANCE_FILL } };
  });
}

function buildOrdersSheet(workbook: ExcelJS.Workbook, orders: CashOrderExcelRow[]) {
  const sheet = workbook.addWorksheet("Операции");
  const columns = [
    { header: "Дата", width: 12 },
    { header: "Тип", width: 10 },
    { header: "Статья", width: 30 },
    { header: "Клиент", width: 22 },
    { header: "Сумма", width: 12 },
    { header: "Валюта", width: 9 },
    { header: "Курс (1 ¥ = ?)", width: 12 },
    { header: "Сумма, ¥", width: 12 },
    { header: "Комментарий", width: 30 },
    { header: "Создал", width: 16 },
  ];
  sheet.columns = columns.map((c) => ({ header: c.header, width: c.width }));

  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT_COLOR } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  });

  for (const order of orders) {
    const row = sheet.addRow([
      order.date.toLocaleDateString("ru-RU"),
      TYPE_LABEL[order.type] ?? order.type,
      order.categoryName,
      order.clientName ?? "",
      money(order.amount),
      CURRENCY_LABEL[order.currency] ?? order.currency,
      money(order.cnyToCurrencyRate),
      money(order.amountCny),
      order.comment,
      order.createdByName,
    ]);
    const fill: ExcelJS.Fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: order.type === "income" ? INCOME_FILL : EXPENSE_FILL },
    };
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = fill;
      cell.alignment = { vertical: "middle" };
    });
  }
}

async function renderCashReportExcel(props: RenderCashReportProps): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Panda Bridge";
  buildSummarySheet(workbook, props);
  buildOrdersSheet(workbook, props.orders);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export { renderCashReportExcel };
export type { CategoryBreakdownRow, CashOrderExcelRow };
