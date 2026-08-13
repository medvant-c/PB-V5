import "server-only";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { quoteDisclaimerPlainText } from "@/lib/desk-services/quote-disclaimer";

// ~4×4cm at 96dpi — doubled from the original ~2×2cm, same aspect ratio
// (sharp's fit:"contain" still letterboxes onto a neutral background
// instead of stretching/cropping, same reasoning as the PDF renderers'
// objectFit:"contain" fix). See PB-V5 chat 2026-08-01.
const PHOTO_PX = 152;
const PHOTO_COL_WIDTH = 22; // character units, ≈ PHOTO_PX at default font
const ROW_HEIGHT = 120; // points, ≈ PHOTO_PX px — every data row, so photos and text line up

const HEADER_FILL = "FF1F3864"; // dark navy
const HEADER_FONT_COLOR = "FFFFFFFF";
const STRIPE_FILL = "FFDCE6F1"; // light blue, alternates with white
// Base body/header font size — bumped from Excel's ~11pt default per PB-V5
// chat 2026-08-01.
const FONT_SIZE = 14;

// Every money column is ₽ except cargo delivery, which can optionally be
// shown in $ instead (see cargoInUsd below) — cargo is the one line this
// business actually negotiates/tracks in $ internally, so a manager
// exporting for that purpose doesn't have to mentally convert every row
// back. Thousands-separated, no decimals for ₽ (every value is already
// Math.round()'d before it's written); $ keeps two decimals since a
// per-kg/m³ cargo rate isn't a round number. See PB-V5 chat 2026-07-31,
// extended 2026-08-01.
const MONEY_FORMAT_RUB = '#,##0" ₽"';
const MONEY_FORMAT_USD = '"$"#,##0.00';
// ¥ columns sit next to their ₽ counterpart (goods price, total, China
// delivery, and every internal service fee) so a manager can read both
// currencies off the same row without a calculator — same rounding
// convention as ₽ (every value already Math.round()'d before it's
// written). See PB-V5 chat 2026-08-03.
const MONEY_FORMAT_CNY = '#,##0" ¥"';
// Цена ЗА ЕДИНИЦУ (не сумма) — у дешёвых товаров закупкой в тысячах штук
// цена за штуку часто дробная (¥1.24, ¥9.50) и округление до целого ¥/₽
// съедает существенную долю цены (¥1.24 → ¥1 — это -19%). Только для колонок
// "Цена, ₽"/"Цена, ¥" — остальные денежные колонки (суммы, обычно крупные)
// по-прежнему округляются до целого. См. PB-V5 chat 2026-08-13.
const MONEY_FORMAT_RUB_UNIT = '#,##0.00" ₽"';
const MONEY_FORMAT_CNY_UNIT = '#,##0.00" ¥"';
// Approximate FONT_SIZE line height in points, for the row-height
// estimate below — not pixel-perfect, just enough that a long wrapped
// cell isn't silently clipped by the fixed photo-aligned row height.
const LINE_HEIGHT_PT = 19;

const QUOTE_TYPE_LABEL: Record<string, string> = {
  standard: "Standart",
  expert: "Expert",
  pro: "Pro",
};

// Order matches the pricing breakdown everywhere else (quote-pdf.tsx,
// quote-dialog.tsx): goods → China delivery → search fee → производство
// под заказ → buyout commission → cargo delivery → extra services → grand
// total. Column at index i corresponds 1:1 with the values pushed in the
// row array below — keep both in sync if either changes. `money` is which
// format applies, not just whether one does — only the cargo column ever
// switches to "usd" (see buildColumns/cargoInUsd).
type MoneyKind = false | "rub" | "usd" | "cny" | "rub_unit" | "cny_unit";
function buildColumns(cargoInUsd: boolean): { header: string; width: number; wrap: boolean; money: MoneyKind }[] {
  return [
    { header: "Клиент", width: 18, wrap: true, money: false },
    { header: "Тип поиска", width: 12, wrap: false, money: false },
    { header: "Фото 1", width: PHOTO_COL_WIDTH, wrap: false, money: false },
    { header: "Фото 2", width: PHOTO_COL_WIDTH, wrap: false, money: false },
    { header: "Фото 3", width: PHOTO_COL_WIDTH, wrap: false, money: false },
    { header: "Наименование", width: 28, wrap: true, money: false },
    // No wrapText — a manager scanning this column wants one line per
    // row, scrollable/expandable in Excel itself if they need the full
    // text, not the row growing to fit it. See PB-V5 chat 2026-08-01.
    { header: "Описание", width: 30, wrap: false, money: false },
    { header: "Цвет", width: 12, wrap: false, money: false },
    { header: "Размеры", width: 16, wrap: true, money: false },
    { header: "Количество", width: 11, wrap: false, money: false },
    { header: "Цена, ₽", width: 12, wrap: false, money: "rub_unit" },
    { header: "Цена, ¥", width: 12, wrap: false, money: "cny_unit" },
    { header: "Общая стоимость, ₽", width: 16, wrap: false, money: "rub" },
    { header: "Общая стоимость, ¥", width: 16, wrap: false, money: "cny" },
    { header: "Доставка по Китаю, ₽", width: 16, wrap: false, money: "rub" },
    { header: "Доставка по Китаю, ¥", width: 16, wrap: false, money: "cny" },
    { header: "Вес, кг", width: 10, wrap: false, money: false },
    { header: "Плотность, кг/м³", width: 14, wrap: false, money: false },
    { header: "Объём, м³", width: 11, wrap: false, money: false },
    { header: "Услуга поиска, ₽", width: 14, wrap: false, money: "rub" },
    { header: "Услуга поиска, ¥", width: 14, wrap: false, money: "cny" },
    { header: "Производство под заказ, ₽", width: 16, wrap: false, money: "rub" },
    { header: "Производство под заказ, ¥", width: 16, wrap: false, money: "cny" },
    { header: "Комиссия за выкуп, ₽", width: 16, wrap: false, money: "rub" },
    { header: "Комиссия за выкуп, ¥", width: 16, wrap: false, money: "cny" },
    { header: "Доп. услуги, ₽", width: 13, wrap: false, money: "rub" },
    { header: "Доп. услуги, ¥", width: 13, wrap: false, money: "cny" },
    { header: cargoInUsd ? "Доставка карго, $" : "Доставка карго, ₽", width: 14, wrap: false, money: cargoInUsd ? "usd" : "rub" },
    { header: "ИТОГО, ₽", width: 13, wrap: false, money: "rub" },
  ];
}

interface QuoteExcelRow {
  clientName: string;
  clientCompany: string | null;
  quoteType: string;
  photoBuffers: Buffer[];
  productName: string;
  productDescription: string | null;
  color: string | null;
  dimensions: string | null;
  quantity: number;
  priceRubPerUnit: number;
  priceCnyPerUnit: number;
  totalPriceRub: number;
  totalPriceCny: number;
  chinaDeliveryRub: number;
  chinaDeliveryCny: number;
  totalWeightKg: number;
  densityKgM3: number;
  totalVolumeM3: number;
  searchServiceFeeRub: number;
  searchFeeWaived: boolean;
  customProductionFeeRub: number;
  buyoutCommissionRub: number;
  attachedServicesTotalRub: number;
  cargoDeliveryRub: number;
  cargoDeliveryUsd: number;
  totalRub: number;
  // The quote's own frozen ¥→₽ rate — the only way to derive a ¥ figure
  // for the three fee fields above (search/production/commission/services)
  // that are only ever stored in ₽, never their own ¥ column on Quote
  // itself. See PB-V5 chat 2026-08-03.
  cnyRateUsed: number;
}

// Crude but sufficient estimate of how many lines `text` wraps to inside a
// column `widthChars` characters wide — ExcelJS/Excel itself won't
// auto-grow a row that already has an explicit height set (needed here so
// every row stays tall enough for the fixed-size photos), so a long
// Описание would otherwise render with wrapText on but visibly clipped
// after ~4 lines. See PB-V5 chat 2026-07-31.
function estimateWrappedLines(text: string, widthChars: number): number {
  if (!text) return 1;
  const usableWidth = Math.max(widthChars - 2, 4);
  return text
    .split("\n")
    .reduce((sum, paragraph) => sum + Math.max(1, Math.ceil(paragraph.length / usableWidth)), 0);
}

async function fitPhotoToSquare(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(PHOTO_PX, PHOTO_PX, { fit: "contain", background: { r: 244, g: 245, b: 248, alpha: 1 } })
    .png()
    .toBuffer();
}

async function renderQuotesExcel(props: {
  client: { name: string; company: string | null };
  rows: QuoteExcelRow[];
  cargoInUsd?: boolean;
}): Promise<Buffer> {
  const { client, rows, cargoInUsd = false } = props;
  const COLUMNS = buildColumns(cargoInUsd);
  const TOTAL_COLUMN_INDEX = COLUMNS.length; // 1-indexed — last column is ИТОГО
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Panda Bridge";
  const sheet = workbook.addWorksheet(`Просчёты — ${client.name}`.slice(0, 31));

  sheet.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  // Header row (№1) stays visible while scrolling through a long list —
  // "закрепление области первой строки". See PB-V5 chat 2026-08-01.
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const headerRow = sheet.getRow(1);
  headerRow.height = 52;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: FONT_SIZE, color: { argb: HEADER_FONT_COLOR } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const values = [
      row.clientCompany ? `${row.clientName} (${row.clientCompany})` : row.clientName,
      QUOTE_TYPE_LABEL[row.quoteType] ?? row.quoteType,
      null,
      null,
      null,
      row.productName,
      row.productDescription ?? "",
      row.color ?? "",
      row.dimensions ?? "",
      row.quantity,
      Number(row.priceRubPerUnit.toFixed(2)),
      Number(row.priceCnyPerUnit.toFixed(2)),
      Math.round(row.totalPriceRub),
      Math.round(row.totalPriceCny),
      Math.round(row.chinaDeliveryRub),
      Math.round(row.chinaDeliveryCny),
      Number(row.totalWeightKg.toFixed(1)),
      Math.round(row.densityKgM3),
      Number(row.totalVolumeM3.toFixed(3)),
      row.searchFeeWaived ? "БЕСПЛАТНО" : Math.round(row.searchServiceFeeRub),
      row.searchFeeWaived ? "БЕСПЛАТНО" : Math.round(row.searchServiceFeeRub / row.cnyRateUsed),
      Math.round(row.customProductionFeeRub),
      Math.round(row.customProductionFeeRub / row.cnyRateUsed),
      Math.round(row.buyoutCommissionRub),
      Math.round(row.buyoutCommissionRub / row.cnyRateUsed),
      Math.round(row.attachedServicesTotalRub),
      Math.round(row.attachedServicesTotalRub / row.cnyRateUsed),
      cargoInUsd ? Number(row.cargoDeliveryUsd.toFixed(2)) : Math.round(row.cargoDeliveryRub),
      Math.round(row.totalRub),
    ];
    const excelRow = sheet.addRow(values);

    const neededLines = Math.max(
      1,
      ...COLUMNS.map((c, i) => (c.wrap ? estimateWrappedLines(String(values[i] ?? ""), c.width) : 1)),
    );
    excelRow.height = Math.max(ROW_HEIGHT, neededLines * LINE_HEIGHT_PT + 8);

    const stripeFill: ExcelJS.Fill | undefined =
      rowIndex % 2 === 1 ? { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE_FILL } } : undefined;

    excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.alignment = {
        vertical: "middle",
        wrapText: Boolean(COLUMNS[colNumber - 1]?.wrap),
      };
      cell.font = colNumber === TOTAL_COLUMN_INDEX ? { bold: true, size: FONT_SIZE } : { size: FONT_SIZE };
      const money = COLUMNS[colNumber - 1]?.money;
      if (money) {
        cell.numFmt =
          money === "usd"
            ? MONEY_FORMAT_USD
            : money === "cny"
              ? MONEY_FORMAT_CNY
              : money === "rub_unit"
                ? MONEY_FORMAT_RUB_UNIT
                : money === "cny_unit"
                  ? MONEY_FORMAT_CNY_UNIT
                  : MONEY_FORMAT_RUB;
      }
      if (stripeFill) cell.fill = stripeFill;
    });

    for (let i = 0; i < 3; i++) {
      const buffer = row.photoBuffers[i];
      if (!buffer) continue;
      try {
        const fitted = await fitPhotoToSquare(buffer);
        // A well-known @types/node 20 ecosystem friction: exceljs's .d.ts
        // and this project's ambient Buffer<T> resolve to structurally
        // incompatible generic instantiations across the package
        // boundary, even though the runtime value is a plain, real
        // Buffer. `any` here is a deliberate, narrow interop escape, not a
        // real type hole — every field except `buffer` stays fully typed.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
        const imageId = workbook.addImage({ buffer: fitted, extension: "png" } as any);
        sheet.addImage(imageId, {
          tl: { col: 2 + i, row: excelRow.number - 1 },
          ext: { width: PHOTO_PX, height: PHOTO_PX },
        });
      } catch (error) {
        console.error("quotes-excel: photo embed failed", error);
      }
    }
  }

  sheet.addRow([]);
  const disclaimerLines = quoteDisclaimerPlainText().split("\n");
  for (const line of disclaimerLines) {
    if (!line) {
      sheet.addRow([]);
      continue;
    }
    const disclaimerRow = sheet.addRow([line]);
    disclaimerRow.getCell(1).font = { italic: true, size: 9, color: { argb: "FF63666F" } };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export { renderQuotesExcel };
export type { QuoteExcelRow };
