import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { Document, Page, View, Text, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";

// Same registration approach (and same reasoning — no Cyrillic/₽ glyphs in
// react-pdf's built-in fonts) as quote-pdf.tsx/quotes-list-pdf.tsx —
// duplicated per-file rather than shared, matching how those two already
// do it.
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

// Internal work order for the warehouse ("кладовщик"), not a client-facing
// document — no photos, no disclaimer, prices shown (per PB-V5 chat
// 2026-07-30: the manager explicitly wants prices visible here, unlike the
// client-facing quote PDF). A checkbox glyph per service line reflects
// whatever's already marked done in the system at export time — this is a
// snapshot, not a live document; re-export after marking more lines to see
// the update on paper.
const styles = StyleSheet.create({
  page: { padding: 32, fontFamily: "Roboto", fontSize: 10, color: "#23252b" },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  metaLine: { fontSize: 9.5, color: "#63666f", marginBottom: 14 },
  itemBlock: { marginBottom: 16 },
  itemHeader: { fontSize: 12, fontWeight: 700, marginBottom: 2 },
  itemMeta: { fontSize: 9, color: "#63666f", marginBottom: 6 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#23252b",
    paddingBottom: 3,
    marginBottom: 2,
  },
  tableHeaderCell: { fontSize: 8.5, fontWeight: 700, color: "#63666f", textTransform: "uppercase" },
  row: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#e1dfd7", alignItems: "center" },
  colCheck: { width: 20, alignItems: "center" },
  colName: { flex: 1, paddingRight: 8 },
  colQty: { width: 50, textAlign: "right" },
  colPrice: { width: 70, textAlign: "right" },
  colSum: { width: 70, textAlign: "right", fontWeight: 700 },
  // A drawn box, not a Unicode "☐/☑" glyph — react-pdf's registered Roboto
  // subset has no ballot-box glyphs, and silently renders nothing rather
  // than erroring, so a checkbox column that "worked" in dev turned out
  // blank on the actual PDF. An "×" is plain ASCII, guaranteed to be in
  // the font. See PB-V5 chat 2026-07-30.
  checkboxBox: { width: 9, height: 9, borderWidth: 1, borderColor: "#23252b", alignItems: "center", justifyContent: "center" },
  checkboxMark: { fontSize: 8, fontWeight: 700, lineHeight: 1 },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#23252b" },
  totalLabel: { fontSize: 11, fontWeight: 700, marginRight: 12 },
  totalValue: { fontSize: 13, fontWeight: 700 },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 8, color: "#9a9c9f", textAlign: "center" },
});

function fmt(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("ru-RU") : "—";
}

interface FulfillmentOrderPdfProps {
  order: {
    displayId: number;
    totalRub: number;
    createdAt: Date;
  };
  client: { name: string; company: string | null };
  manager: { name: string };
  items: {
    name: string;
    sku: string | null;
    dimensions: string | null;
    services: {
      name: string;
      priceRub: number;
      quantity: number;
      completedAt: Date | null;
    }[];
  }[];
}

function FulfillmentOrderPdfDocument({ order, client, manager, items }: FulfillmentOrderPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Наряд-задание — Фулфилмент №{order.displayId}</Text>
        <Text style={styles.metaLine}>
          Клиент: {client.name}
          {client.company ? ` (${client.company})` : ""} · Менеджер: {manager.name} ·{" "}
          {order.createdAt.toLocaleDateString("ru-RU")}
        </Text>

        {items.map((item, itemIndex) => (
          <View key={itemIndex} style={styles.itemBlock} wrap={false}>
            <Text style={styles.itemHeader}>
              {itemIndex + 1}. {item.name}
            </Text>
            {(item.sku || item.dimensions) && (
              <Text style={styles.itemMeta}>
                {item.sku ? `Артикул: ${item.sku}` : ""}
                {item.sku && item.dimensions ? " · " : ""}
                {item.dimensions ? `Габариты: ${item.dimensions}` : ""}
              </Text>
            )}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, styles.colCheck]} />
              <Text style={[styles.tableHeaderCell, styles.colName]}>Услуга</Text>
              <Text style={[styles.tableHeaderCell, styles.colQty]}>Кол-во</Text>
              <Text style={[styles.tableHeaderCell, styles.colPrice]}>Цена</Text>
              <Text style={[styles.tableHeaderCell, styles.colSum]}>Сумма</Text>
            </View>
            {item.services.map((service, serviceIndex) => (
              <View key={serviceIndex} style={styles.row}>
                <View style={styles.colCheck}>
                  <View style={styles.checkboxBox}>{service.completedAt && <Text style={styles.checkboxMark}>×</Text>}</View>
                </View>
                <Text style={styles.colName}>{service.name}</Text>
                <Text style={styles.colQty}>{service.quantity}</Text>
                <Text style={styles.colPrice}>{fmt(service.priceRub)} ₽</Text>
                <Text style={styles.colSum}>{fmt(service.priceRub * service.quantity)} ₽</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>ИТОГО</Text>
          <Text style={styles.totalValue}>{fmt(order.totalRub)} ₽</Text>
        </View>

        <Text style={styles.footer} fixed>
          Panda Bridge — экосистема для бизнеса с Китаем.
        </Text>
      </Page>
    </Document>
  );
}

async function renderFulfillmentOrderPdf(props: FulfillmentOrderPdfProps): Promise<Buffer> {
  await ensureFontsRegistered();
  return renderToBuffer(<FulfillmentOrderPdfDocument {...props} />);
}

export { renderFulfillmentOrderPdf };
export type { FulfillmentOrderPdfProps };
