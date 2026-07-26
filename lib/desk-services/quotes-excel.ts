import "server-only";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { quoteDisclaimerPlainText } from "@/lib/desk-services/quote-disclaimer";

// ~2×2cm at 96dpi ("вставь фото — примерно 2 на 2 см", not stretched/
// cropped: sharp's fit:"contain" letterboxes onto a neutral background
// instead, same reasoning as the PDF renderers' objectFit:"contain" fix).
const PHOTO_PX = 76;
const PHOTO_COL_WIDTH = 11; // character units, ≈ PHOTO_PX at default font
const ROW_HEIGHT = 60; // points, ≈ PHOTO_PX px — every data row, so photos and text line up

const HEADER_FILL = "FF1F3864"; // dark navy
const HEADER_FONT_COLOR = "FFFFFFFF";
const STRIPE_FILL = "FFDCE6F1"; // light blue, alternates with white

const QUOTE_TYPE_LABEL: Record<string, string> = {
  standard: "Standart",
  expert: "Expert",
  pro: "Pro",
};

// Order matches the pricing breakdown everywhere else (quote-pdf.tsx,
// quote-dialog.tsx): goods → China delivery → search fee → buyout
// commission → cargo delivery → extra services → grand total. Column at
// index i corresponds 1:1 with the values pushed in the row array below —
// keep both in sync if either changes.
const COLUMNS = [
  { header: "Тип поиска", width: 12, wrap: false },
  { header: "Фото 1", width: PHOTO_COL_WIDTH, wrap: false },
  { header: "Фото 2", width: PHOTO_COL_WIDTH, wrap: false },
  { header: "Фото 3", width: PHOTO_COL_WIDTH, wrap: false },
  { header: "Наименование", width: 28, wrap: true },
  { header: "Описание", width: 30, wrap: true },
  { header: "Цвет", width: 12, wrap: false },
  { header: "Размеры", width: 16, wrap: true },
  { header: "Количество", width: 11, wrap: false },
  { header: "Цена, ₽", width: 12, wrap: false },
  { header: "Общая стоимость, ₽", width: 16, wrap: false },
  { header: "Доставка по Китаю, ₽", width: 16, wrap: false },
  { header: "Вес, кг", width: 10, wrap: false },
  { header: "Плотность, кг/м³", width: 14, wrap: false },
  { header: "Объём, м³", width: 11, wrap: false },
  { header: "Услуга поиска, ₽", width: 14, wrap: false },
  { header: "Комиссия за выкуп, ₽", width: 16, wrap: false },
  { header: "Доп. услуги, ₽", width: 13, wrap: false },
  { header: "Доставка карго, ₽", width: 14, wrap: false },
  { header: "ИТОГО, ₽", width: 13, wrap: false },
] as const;
const TOTAL_COLUMN_INDEX = COLUMNS.length; // 1-indexed — last column is ИТОГО

interface QuoteExcelRow {
  quoteType: string;
  photoBuffers: Buffer[];
  productName: string;
  productDescription: string | null;
  color: string | null;
  dimensions: string | null;
  quantity: number;
  priceRubPerUnit: number;
  totalPriceRub: number;
  chinaDeliveryRub: number;
  totalWeightKg: number;
  densityKgM3: number;
  totalVolumeM3: number;
  searchServiceFeeRub: number;
  searchFeeWaived: boolean;
  buyoutCommissionRub: number;
  attachedServicesTotalRub: number;
  cargoDeliveryRub: number;
  totalRub: number;
}

async function fitPhotoToSquare(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(PHOTO_PX, PHOTO_PX, { fit: "contain", background: { r: 244, g: 245, b: 248, alpha: 1 } })
    .png()
    .toBuffer();
}

async function renderQuotesExcel(props: { client: { name: string; company: string | null }; rows: QuoteExcelRow[] }): Promise<Buffer> {
  const { client, rows } = props;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Panda Bridge";
  const sheet = workbook.addWorksheet(`Просчёты — ${client.name}`.slice(0, 31));

  sheet.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));

  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT_COLOR } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const excelRow = sheet.addRow([
      QUOTE_TYPE_LABEL[row.quoteType] ?? row.quoteType,
      null,
      null,
      null,
      row.productName,
      row.productDescription ?? "",
      row.color ?? "",
      row.dimensions ?? "",
      row.quantity,
      Math.round(row.priceRubPerUnit),
      Math.round(row.totalPriceRub),
      Math.round(row.chinaDeliveryRub),
      Number(row.totalWeightKg.toFixed(1)),
      Math.round(row.densityKgM3),
      Number(row.totalVolumeM3.toFixed(3)),
      row.searchFeeWaived ? "БЕСПЛАТНО" : Math.round(row.searchServiceFeeRub),
      Math.round(row.buyoutCommissionRub),
      Math.round(row.attachedServicesTotalRub),
      Math.round(row.cargoDeliveryRub),
      Math.round(row.totalRub),
    ]);
    excelRow.height = ROW_HEIGHT;

    const stripeFill: ExcelJS.Fill | undefined =
      rowIndex % 2 === 1 ? { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE_FILL } } : undefined;

    excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.alignment = {
        vertical: "middle",
        wrapText: Boolean(COLUMNS[colNumber - 1]?.wrap),
      };
      if (stripeFill) cell.fill = stripeFill;
      if (colNumber === TOTAL_COLUMN_INDEX) cell.font = { bold: true };
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
          tl: { col: 1 + i, row: excelRow.number - 1 },
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
