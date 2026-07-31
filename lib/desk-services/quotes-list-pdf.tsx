import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { Document, Page, View, Text, Image, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import { QUOTE_DISCLAIMER_TITLE, QUOTE_DISCLAIMER_BLOCKS, stripEmojiForPdf } from "@/lib/desk-services/quote-disclaimer";

// Same font as lib/desk-services/quote-pdf.tsx — see that file's comment for
// why it must be the full, unsplit Roboto file (₽/digits/¥ coverage).
let fontsRegistered = false;
async function ensureFontsRegistered() {
  if (fontsRegistered) return;
  const [regular, bold] = await Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/roboto-400.woff")),
    readFile(path.join(process.cwd(), "public/fonts/roboto-700.woff")),
  ]);
  Font.register({
    family: "Roboto",
    fonts: [
      { src: `data:font/woff;base64,${regular.toString("base64")}`, fontWeight: 400 },
      { src: `data:font/woff;base64,${bold.toString("base64")}`, fontWeight: 700 },
    ],
  });
  fontsRegistered = true;
}

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: "Roboto", fontSize: 9.5, color: "#23252b" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  title: { fontSize: 16, fontWeight: 700 },
  clientLine: { fontSize: 9.5, color: "#63666f", marginTop: 2 },
  meta: { fontSize: 9, color: "#9a9c9f", textAlign: "right" },
  table: { borderTopWidth: 1, borderTopColor: "#23252b" },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#23252b", paddingVertical: 6 },
  headCell: { fontSize: 8.5, fontWeight: 700, color: "#63666f", textTransform: "uppercase", maxLines: 1 },
  bodyRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: 0.5, borderBottomColor: "#e1dfd7", paddingVertical: 6 },
  // Layout-only — applied to both Text cells and the View wrapping the
  // photo Image, so it must NOT carry Text-only props (see cellText below).
  cell: { justifyContent: "center" },
  // maxLines/textOverflow, not just a fixed width, is what actually stops
  // react-pdf from word-wrapping — its default hyphenation callback force-
  // splits a word that doesn't fit a measured width (e.g. "Expert" →
  // "Ex-"/"pert" on two lines), and a fixed-height row then clips the
  // first line, leaving only "pert" visible. maxLines: 1 + ellipsis makes
  // it truncate on one line instead of silently mangling the text. Kept
  // separate from `cell` — applying these to the photo column's View
  // (which wraps an Image, not text) breaks the image render entirely.
  cellText: { maxLines: 1, textOverflow: "ellipsis" },
  colNum: { width: 26 },
  colType: { width: 60 },
  colPhoto: { width: 52 },
  colName: { flex: 1, paddingRight: 8 },
  colQty: { width: 50, textAlign: "right" },
  colWeight: { width: 52, textAlign: "right" },
  colVolume: { width: 54, textAlign: "right" },
  colDensity: { width: 68, textAlign: "right" },
  colTariff: { width: 62, textAlign: "right" },
  // Wide enough for the full one-line header "ЦЕНА/ЕД. ПОД КЛЮЧ, ₽" at
  // headCell's 8.5pt bold uppercase — 84 clipped it to "…ПОД" with nothing
  // after (maxLines: 1 has no ellipsis fallback, so it just vanished).
  colPerUnit: { width: 118, textAlign: "right" },
  colTotal: { width: 90, textAlign: "right" },
  // contain, not cover — same reasoning as quote-pdf.tsx's heroPhoto.
  thumb: { width: 40, height: 40, borderRadius: 5, objectFit: "contain", backgroundColor: "#f4f5f8" },
  totalCellValue: { fontWeight: 700, maxLines: 1, textOverflow: "ellipsis" },
  freeTag: { fontSize: 7.5, fontWeight: 700, color: "#1f9d55", maxLines: 1, textOverflow: "ellipsis" },
  totalsRow: { flexDirection: "row", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#23252b", justifyContent: "flex-end", alignItems: "center", gap: 12 },
  totalsSubLabel: { fontSize: 9, color: "#63666f" },
  totalsSubValue: { fontSize: 9, fontWeight: 700, marginRight: 12 },
  totalsLabel: { fontSize: 11, fontWeight: 700 },
  totalsValue: { fontSize: 16, fontWeight: 700, color: "#2454cc" },
  footer: { position: "absolute", bottom: 10, left: 28, right: 28, fontSize: 8, color: "#9a9c9f", textAlign: "center" },
  disclaimerBox: { marginTop: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#e1dfd7" },
  disclaimerTitle: { fontSize: 10, fontWeight: 700, marginBottom: 5, color: "#23252b" },
  disclaimerParagraph: { fontSize: 7.5, color: "#63666f", marginBottom: 2.5, lineHeight: 1.35 },
  disclaimerBullets: { marginBottom: 2.5, paddingLeft: 6 },
});

function fmt(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

const QUOTE_TYPE_LABEL: Record<string, string> = {
  standard: "Standart",
  expert: "Expert",
  pro: "Pro",
};

interface QuoteListRow {
  displayId: number;
  quoteType: string;
  productName: string;
  quantity: number;
  totalRub: number;
  searchFeeWaived: boolean;
  photoBuffer: Buffer | null;
  totalWeightKg: number;
  totalVolumeM3: number;
  densityKgM3: number;
  // Both optional and only ever set together — the manager-side route
  // populates them and passes showTariff (see QuotesListPdfProps below),
  // the client-facing route leaves them out entirely. The $ rate is an
  // internal costing figure (what Panda Bridge quotes/pays for cargo, not
  // a number the client's own copy of this table needs), unlike
  // weight/volume which the client already sees on their own single-quote
  // PDF (see quote-pdf.tsx's "Доставка карго" line) and needs for their
  // own shipping/customs planning.
  cargoRateUsd?: number;
  deliveryPricingMode?: "density" | "volume";
}

// "Под ключ" — the full all-in total (goods + delivery + fees + commission)
// spread evenly across the quantity, not just the goods price per unit.
function perUnitTurnkeyRub(row: QuoteListRow): number {
  return row.quantity > 0 ? row.totalRub / row.quantity : 0;
}

interface QuotesListPdfProps {
  client: { name: string; company: string | null };
  rows: QuoteListRow[];
  // See QuoteListRow.cargoRateUsd above — manager route only.
  showTariff?: boolean;
}

function QuotesListPdfDocument({ client, rows, showTariff }: QuotesListPdfProps) {
  const grandTotal = rows.reduce((sum, row) => sum + row.totalRub, 0);
  const totalWeightKg = rows.reduce((sum, row) => sum + row.totalWeightKg, 0);
  const totalVolumeM3 = rows.reduce((sum, row) => sum + row.totalVolumeM3, 0);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>
              Все просчёты — {client.name}
              {client.company ? ` · ${client.company}` : ""}
            </Text>
            <Text style={styles.clientLine}>Всего просчётов: {rows.length}</Text>
          </View>
          <Text style={styles.meta}>{new Date().toLocaleDateString("ru-RU")}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.headRow}>
            <Text style={[styles.headCell, styles.colNum]}>№</Text>
            <Text style={[styles.headCell, styles.colType]}>Тип</Text>
            <Text style={[styles.headCell, styles.colPhoto]}>Фото</Text>
            <Text style={[styles.headCell, styles.colName]}>Наименование</Text>
            <Text style={[styles.headCell, styles.colQty]}>Кол-во</Text>
            <Text style={[styles.headCell, styles.colWeight]}>Вес, кг</Text>
            <Text style={[styles.headCell, styles.colVolume]}>Объём, м³</Text>
            <Text style={[styles.headCell, styles.colDensity]}>Плотн., кг/м³</Text>
            {showTariff && <Text style={[styles.headCell, styles.colTariff]}>Тариф, $</Text>}
            <Text style={[styles.headCell, styles.colPerUnit]}>Цена/ед. под ключ, ₽</Text>
            <Text style={[styles.headCell, styles.colTotal]}>Итого, ₽</Text>
          </View>

          {rows.map((row) => (
            <View key={row.displayId} style={styles.bodyRow}>
              <Text style={[styles.cell, styles.cellText, styles.colNum]}>{row.displayId}</Text>
              <Text style={[styles.cell, styles.cellText, styles.colType]}>
                {QUOTE_TYPE_LABEL[row.quoteType] ?? row.quoteType}
              </Text>
              <View style={[styles.cell, styles.colPhoto]}>
                {row.photoBuffer ? (
                  // cache={false}: react-pdf's internal resolveImage LRU cache intermittently
                  // corrupts the render when two quotes reuse identical image bytes (a common
                  // case here — a manager pastes the same product photo into more than one
                  // quote) in the same document; disabling it is the documented workaround.
                  // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image is a PDF drawing primitive, not an HTML <img>; it has no alt prop
                  <Image src={row.photoBuffer} style={styles.thumb} cache={false} />
                ) : (
                  <Text style={{ color: "#9a9c9f" }}>—</Text>
                )}
              </View>
              <Text style={[styles.cell, styles.cellText, styles.colName]}>{row.productName}</Text>
              <Text style={[styles.cell, styles.cellText, styles.colQty]}>{row.quantity} шт</Text>
              <Text style={[styles.cell, styles.cellText, styles.colWeight]}>{row.totalWeightKg.toFixed(1)}</Text>
              <Text style={[styles.cell, styles.cellText, styles.colVolume]}>{row.totalVolumeM3.toFixed(3)}</Text>
              <Text style={[styles.cell, styles.cellText, styles.colDensity]}>{fmt(row.densityKgM3)}</Text>
              {showTariff && (
                <Text style={[styles.cell, styles.cellText, styles.colTariff]}>
                  {row.cargoRateUsd !== undefined
                    ? `$${row.cargoRateUsd.toFixed(2)}/${row.deliveryPricingMode === "volume" ? "м³" : "кг"}`
                    : "—"}
                </Text>
              )}
              <Text style={[styles.cell, styles.cellText, styles.colPerUnit]}>{fmt(perUnitTurnkeyRub(row))}</Text>
              <View style={[styles.cell, styles.colTotal]}>
                <Text style={styles.totalCellValue}>{fmt(row.totalRub)} ₽</Text>
                {row.searchFeeWaived && <Text style={styles.freeTag}>поиск бесплатно</Text>}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.totalsRow}>
          <Text style={styles.totalsSubLabel}>Общий вес партии:</Text>
          <Text style={styles.totalsSubValue}>{totalWeightKg.toFixed(1)} кг</Text>
          <Text style={styles.totalsSubLabel}>Общий объём:</Text>
          <Text style={styles.totalsSubValue}>{totalVolumeM3.toFixed(3)} м³</Text>
          <Text style={styles.totalsLabel}>ИТОГО ПО ВСЕМ ПРОСЧЁТАМ</Text>
          <Text style={styles.totalsValue}>{fmt(grandTotal)} ₽</Text>
        </View>

        <View style={styles.disclaimerBox} wrap={false}>
          <Text style={styles.disclaimerTitle}>{stripEmojiForPdf(QUOTE_DISCLAIMER_TITLE)}</Text>
          {QUOTE_DISCLAIMER_BLOCKS.map((block, index) =>
            block.type === "paragraph" ? (
              <Text key={index} style={styles.disclaimerParagraph}>
                {stripEmojiForPdf(block.text)}
              </Text>
            ) : (
              <View key={index} style={styles.disclaimerBullets}>
                {block.items.map((item, itemIndex) => (
                  <Text key={itemIndex} style={styles.disclaimerParagraph}>
                    •  {item}
                  </Text>
                ))}
              </View>
            ),
          )}
        </View>

        <Text style={styles.footer} fixed>
          Panda Bridge — экосистема для бизнеса с Китаем.
        </Text>
      </Page>
    </Document>
  );
}

async function renderQuotesListPdf(props: QuotesListPdfProps): Promise<Buffer> {
  await ensureFontsRegistered();
  return renderToBuffer(<QuotesListPdfDocument {...props} />);
}

export { renderQuotesListPdf };
export type { QuoteListRow };
