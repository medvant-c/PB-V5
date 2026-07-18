import "server-only";
import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

// Panda Bridge brand colors (app/globals.css --color-primary/--color-text-secondary),
// reused here so generated reports look like they came from the same company —
// not the green palette from the reference demo PDFs, which was just placeholder styling.
const BRAND_PRIMARY = "4F7BFF";
const BRAND_TEXT = "111827";
const BRAND_TEXT_SECONDARY = "667085";
const BRAND_BORDER = "E5E7EB";

function coverPage(serviceLabel: string, title: string, subtitle: string, tocItems: string[]): Paragraph[] {
  const today = new Date().toLocaleDateString("ru-RU", { year: "numeric", month: "long" });
  return [
    new Paragraph({
      children: [new TextRun({ text: "PANDA BRIDGE", bold: true, size: 24, color: BRAND_PRIMARY })],
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Услуга: ${serviceLabel}`, size: 20, color: BRAND_TEXT_SECONDARY })],
      spacing: { after: 300 },
    }),
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 44, color: BRAND_TEXT })],
      spacing: { after: 160 },
    }),
    new Paragraph({
      children: [new TextRun({ text: subtitle, size: 22, color: BRAND_TEXT_SECONDARY })],
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Подготовлено Panda AI · ${today}`, italics: true, size: 18, color: BRAND_TEXT_SECONDARY }),
      ],
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Состав отчёта", bold: true, size: 24, color: BRAND_TEXT })],
      spacing: { after: 160 },
    }),
    ...tocItems.map(
      (item) =>
        new Paragraph({
          children: [new TextRun({ text: `—  ${item}`, size: 20, color: BRAND_TEXT })],
          spacing: { after: 80 },
        }),
    ),
    new Paragraph({ text: "", pageBreakBefore: true }),
  ];
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1): Paragraph {
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, color: BRAND_PRIMARY })],
  });
}

function body(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 160 },
    children: [new TextRun({ text, color: BRAND_TEXT })],
  });
}

function note(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 160 },
    children: [new TextRun({ text, italics: true, size: 18, color: BRAND_TEXT_SECONDARY })],
  });
}

function bulletList(items: string[]): Paragraph[] {
  return items.map(
    (item) =>
      new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 60 },
        children: [new TextRun({ text: item, color: BRAND_TEXT })],
      }),
  );
}

function calloutBox(title: string, text: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: BRAND_PRIMARY },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND_PRIMARY },
      left: { style: BorderStyle.SINGLE, size: 4, color: BRAND_PRIMARY },
      right: { style: BorderStyle.SINGLE, size: 4, color: BRAND_PRIMARY },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, color: "auto", fill: "F0F4FF" },
            margins: { top: 160, bottom: 160, left: 160, right: 160 },
            children: [
              new Paragraph({
                spacing: { after: 60 },
                children: [new TextRun({ text: title, bold: true, color: BRAND_PRIMARY })],
              }),
              new Paragraph({ children: [new TextRun({ text, color: BRAND_TEXT })] }),
            ],
          }),
        ],
      }),
    ],
  });
}

function dataTable(headers: string[], rows: string[][]): Table {
  const columnWidth = 100 / headers.length;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: BRAND_BORDER },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: BRAND_BORDER },
      left: { style: BorderStyle.SINGLE, size: 1, color: BRAND_BORDER },
      right: { style: BorderStyle.SINGLE, size: 1, color: BRAND_BORDER },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: BRAND_BORDER },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: BRAND_BORDER },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map(
          (h) =>
            new TableCell({
              width: { size: columnWidth, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, color: "auto", fill: BRAND_PRIMARY },
              margins: { top: 100, bottom: 100, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 18 })] })],
            }),
        ),
      }),
      ...rows.map(
        (row, rowIndex) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  width: { size: columnWidth, type: WidthType.PERCENTAGE },
                  shading: rowIndex % 2 === 1 ? { type: ShadingType.CLEAR, color: "auto", fill: "F7F8FA" } : undefined,
                  margins: { top: 100, bottom: 100, left: 120, right: 120 },
                  children: [new Paragraph({ children: [new TextRun({ text: cell, size: 18, color: BRAND_TEXT })] })],
                }),
            ),
          }),
      ),
    ],
  });
}

function spacer(): Paragraph {
  return new Paragraph({ spacing: { after: 160 }, children: [] });
}

async function buildDocxBuffer(children: (Paragraph | Table)[]): Promise<Buffer> {
  const doc = new Document({
    sections: [{ children }],
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 20 },
        },
      },
    },
  });
  return Packer.toBuffer(doc);
}

export { coverPage, heading, body, note, bulletList, calloutBox, dataTable, spacer, buildDocxBuffer, HeadingLevel };
