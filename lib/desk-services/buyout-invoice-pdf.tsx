import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { Document, Page, View, Text, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";

// Same font as lib/desk-services/quote-pdf.tsx — see that file's comment
// for why it must be the full, unsplit Roboto file (₽/digits/¥/$ coverage).
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
  page: { padding: 32, fontFamily: "Roboto", fontSize: 10, color: "#23252b" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title: { fontSize: 17, fontWeight: 700 },
  subLine: { fontSize: 10, color: "#63666f", marginTop: 3 },
  meta: { fontSize: 9, color: "#9a9c9f", textAlign: "right" },
  table: { borderTopWidth: 1, borderTopColor: "#23252b", marginTop: 8 },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#23252b", paddingVertical: 7 },
  headCellLabel: { flex: 1, fontSize: 8.5, fontWeight: 700, color: "#63666f", textTransform: "uppercase" },
  headCellQty: { width: 60, fontSize: 8.5, fontWeight: 700, color: "#63666f", textTransform: "uppercase", textAlign: "center" },
  headCellAmount: { width: 130, fontSize: 8.5, fontWeight: 700, color: "#63666f", textTransform: "uppercase", textAlign: "right" },
  bodyRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: 0.5, borderBottomColor: "#e1dfd7", paddingVertical: 9 },
  cellLabel: { flex: 1, fontSize: 10 },
  cellQty: { width: 60, fontSize: 10, textAlign: "center", color: "#63666f" },
  cellAmount: { width: 130, fontSize: 10, textAlign: "right" },
  totalsRow: { flexDirection: "row", marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#23252b", justifyContent: "space-between", alignItems: "center" },
  totalsLabel: { fontSize: 12, fontWeight: 700 },
  totalsValue: { fontSize: 18, fontWeight: 700, color: "#2454cc" },
  note: { marginTop: 18, fontSize: 8.5, color: "#63666f", lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 14, left: 32, right: 32, fontSize: 8, color: "#9a9c9f", textAlign: "center" },
});

type BuyoutInvoiceCurrency = "rub" | "usd" | "usdt" | "cny";

const CURRENCY_LABEL: Record<BuyoutInvoiceCurrency, string> = {
  rub: "₽",
  usd: "$",
  usdt: "USDT",
  cny: "¥",
};

function fmt(value: number, currency: BuyoutInvoiceCurrency): string {
  if (!Number.isFinite(value)) return "—";
  if (currency === "usdt" || currency === "cny") return value.toFixed(2);
  return Math.round(value).toLocaleString("ru-RU");
}

interface BuyoutInvoiceLineItem {
  label: string;
  amount: number;
  // Только у строки "Стоимость товара" — денежные категории (доставка,
  // услуга поиска, комиссия, доп. услуги) не поштучные, у них undefined.
  quantity?: number;
}

interface BuyoutInvoicePdfProps {
  displayId: number;
  client: { name: string; company: string | null };
  productName: string;
  currency: BuyoutInvoiceCurrency;
  // Already converted into `currency` by the caller — this renderer is
  // pure presentation, it doesn't know about tariffs/tiers.
  lineItems: BuyoutInvoiceLineItem[];
  totalAmount: number;
  // Shown as a footnote so the client can see what rate their USDT/$ figure
  // was converted at — omitted for the ₽ invoice, which needs no conversion.
  rateNote: string | null;
}

function BuyoutInvoicePdfDocument({ displayId, client, productName, currency, lineItems, totalAmount, rateNote }: BuyoutInvoicePdfProps) {
  const currencySuffix = ` ${CURRENCY_LABEL[currency]}`;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>
              Счёт на выкуп — просчёт №{displayId}
            </Text>
            <Text style={styles.subLine}>
              {client.name}
              {client.company ? ` · ${client.company}` : ""} · {productName}
            </Text>
          </View>
          <Text style={styles.meta}>{new Date().toLocaleDateString("ru-RU")}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.headRow}>
            <Text style={styles.headCellLabel}>Статья</Text>
            <Text style={styles.headCellQty}>Кол-во</Text>
            <Text style={styles.headCellAmount}>Сумма{currencySuffix}</Text>
          </View>
          {lineItems.map((item, index) => (
            <View key={index} style={styles.bodyRow}>
              <Text style={styles.cellLabel}>{item.label}</Text>
              <Text style={styles.cellQty}>{item.quantity != null ? `${item.quantity} шт.` : "—"}</Text>
              <Text style={styles.cellAmount}>{fmt(item.amount, currency)}{currencySuffix}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>ИТОГО К ОПЛАТЕ</Text>
          <Text style={styles.totalsValue}>{fmt(totalAmount, currency)}{currencySuffix}</Text>
        </View>

        {rateNote && <Text style={styles.note}>{rateNote}</Text>}

        <Text style={styles.footer} fixed>
          Panda Bridge — экосистема для бизнеса с Китаем.
        </Text>
      </Page>
    </Document>
  );
}

async function renderBuyoutInvoicePdf(props: BuyoutInvoicePdfProps): Promise<Buffer> {
  await ensureFontsRegistered();
  return renderToBuffer(<BuyoutInvoicePdfDocument {...props} />);
}

export { renderBuyoutInvoicePdf };
export type { BuyoutInvoiceLineItem, BuyoutInvoiceCurrency, BuyoutInvoicePdfProps };
