import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { Document, Page, View, Text, Image, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import { QUOTE_DISCLAIMER_TITLE, QUOTE_DISCLAIMER_BLOCKS, stripEmojiForPdf } from "@/lib/desk-services/quote-disclaimer";

// Same font as lib/desk-services/quote-pdf.tsx / quotes-list-pdf.tsx — see
// quote-pdf.tsx's comment for why it must be the full, unsplit Roboto file
// (₽/digits/¥/$ coverage).
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
  cell: { justifyContent: "center" },
  cellText: { maxLines: 1, textOverflow: "ellipsis" },
  colNum: { width: 26 },
  colPhoto: { width: 52 },
  colName: { flex: 1, paddingRight: 8 },
  colQty: { width: 50, textAlign: "right" },
  colVolume: { width: 60, textAlign: "right" },
  colDeliveryPerUnit: { width: 90, textAlign: "right" },
  colGoodsRub: { width: 90, textAlign: "right" },
  colTotal: { width: 90, textAlign: "right" },
  thumb: { width: 40, height: 40, borderRadius: 5, objectFit: "contain", backgroundColor: "#f4f5f8" },
  nameSub: { fontSize: 8, color: "#9a9c9f" },
  totalCellValue: { fontWeight: 700, maxLines: 1, textOverflow: "ellipsis" },
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
  return Number.isFinite(value) ? Math.round(value).toLocaleString("ru-RU") : "—";
}

interface ContainerShipmentPdfRow {
  displayId: number;
  productName: string;
  color: string | null;
  dimensions: string | null;
  quantity: number;
  totalVolumeM3: number;
  goodsAndFeesRub: number;
  photoBuffer: Buffer | null;
}

interface ContainerShipmentPdfProps {
  displayId: number;
  client: { name: string; company: string | null };
  containerTypeLabel: string;
  // What the client is charged for the whole container's delivery, $ — the
  // basis every row's own delivery share is proportioned from (see
  // ContainerShipment.totalDeliveryUsd in prisma/schema.prisma).
  totalDeliveryUsd: number;
  usdRateRub: number;
  rows: ContainerShipmentPdfRow[];
}

function ContainerShipmentPdfDocument({ displayId, client, containerTypeLabel, totalDeliveryUsd, usdRateRub, rows }: ContainerShipmentPdfProps) {
  const totalVolumeM3Sum = rows.reduce((sum, r) => sum + r.totalVolumeM3, 0);
  const computedRows = rows.map((row) => {
    const volumeShare = totalVolumeM3Sum > 0 ? row.totalVolumeM3 / totalVolumeM3Sum : 0;
    const deliveryUsd = volumeShare * totalDeliveryUsd;
    const deliveryRub = deliveryUsd * usdRateRub;
    const deliveryPerUnitUsd = row.quantity > 0 ? deliveryUsd / row.quantity : 0;
    const itemTotalRub = row.goodsAndFeesRub + deliveryRub;
    return { ...row, deliveryPerUnitUsd, itemTotalRub };
  });
  const grandTotalRub = computedRows.reduce((sum, r) => sum + r.itemTotalRub, 0);
  const grandTotalUsd = usdRateRub > 0 ? grandTotalRub / usdRateRub : 0;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>
              Контейнер ЖД доставки №{displayId} — {client.name}
              {client.company ? ` · ${client.company}` : ""}
            </Text>
            <Text style={styles.clientLine}>
              Контейнер: {containerTypeLabel} · Позиций: {rows.length} · Доставка контейнера: ${fmt(totalDeliveryUsd)}
            </Text>
          </View>
          <Text style={styles.meta}>{new Date().toLocaleDateString("ru-RU")}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.headRow}>
            <Text style={[styles.headCell, styles.colNum]}>№</Text>
            <Text style={[styles.headCell, styles.colPhoto]}>Фото</Text>
            <Text style={[styles.headCell, styles.colName]}>Наименование</Text>
            <Text style={[styles.headCell, styles.colQty]}>Кол-во</Text>
            <Text style={[styles.headCell, styles.colVolume]}>Объём, м³</Text>
            <Text style={[styles.headCell, styles.colDeliveryPerUnit]}>Доставка/ед., $</Text>
            <Text style={[styles.headCell, styles.colGoodsRub]}>Цена товара, ₽</Text>
            <Text style={[styles.headCell, styles.colTotal]}>Итого, ₽</Text>
          </View>

          {computedRows.map((row) => {
            const characteristics = [row.color, row.dimensions].filter(Boolean).join(" · ");
            return (
              <View key={row.displayId} style={styles.bodyRow}>
                <Text style={[styles.cell, styles.cellText, styles.colNum]}>{row.displayId}</Text>
                <View style={[styles.cell, styles.colPhoto]}>
                  {row.photoBuffer ? (
                    // cache={false} — see quotes-list-pdf.tsx's identical comment
                    // (react-pdf's image cache intermittently corrupts renders when
                    // two rows reuse identical image bytes).
                    // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image is a PDF drawing primitive, not an HTML <img>; it has no alt prop
                    <Image src={row.photoBuffer} style={styles.thumb} cache={false} />
                  ) : (
                    <Text style={{ color: "#9a9c9f" }}>—</Text>
                  )}
                </View>
                <View style={[styles.cell, styles.colName]}>
                  <Text style={styles.cellText}>{row.productName}</Text>
                  {characteristics && <Text style={[styles.nameSub, styles.cellText]}>{characteristics}</Text>}
                </View>
                <Text style={[styles.cell, styles.cellText, styles.colQty]}>{row.quantity} шт</Text>
                <Text style={[styles.cell, styles.cellText, styles.colVolume]}>{row.totalVolumeM3.toFixed(3)}</Text>
                <Text style={[styles.cell, styles.cellText, styles.colDeliveryPerUnit]}>${row.deliveryPerUnitUsd.toFixed(2)}</Text>
                <Text style={[styles.cell, styles.cellText, styles.colGoodsRub]}>{fmt(row.goodsAndFeesRub)} ₽</Text>
                <Text style={[styles.cell, styles.totalCellValue, styles.colTotal]}>{fmt(row.itemTotalRub)} ₽</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>ИТОГО К ОПЛАТЕ</Text>
          <Text style={styles.totalsValue}>
            ${fmt(grandTotalUsd)} / {fmt(grandTotalRub)} ₽
          </Text>
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

async function renderContainerShipmentPdf(props: ContainerShipmentPdfProps): Promise<Buffer> {
  await ensureFontsRegistered();
  return renderToBuffer(<ContainerShipmentPdfDocument {...props} />);
}

export { renderContainerShipmentPdf };
export type { ContainerShipmentPdfRow };
