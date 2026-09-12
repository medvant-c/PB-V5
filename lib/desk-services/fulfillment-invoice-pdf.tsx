import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { Document, Page, View, Text, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";

// Same font as lib/desk-services/quote-pdf.tsx — see that file's comment
// for why it must be the full, unsplit Roboto file (₽/digits/¥ coverage).
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

// Клиентский счёт по заявке на обработку — в отличие от наряда для склада
// (fulfillment-order-pdf.tsx), здесь нет ни чекбоксов, ни отметок "кто
// выполнил": только позиции с итоговой суммой по каждой (без разбивки на
// отдельные услуги — клиенту нужна сумма к оплате, не внутренняя
// калькуляция склада). Те же стили/шрифт, что и buyout-invoice-pdf.tsx.
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
  footer: { position: "absolute", bottom: 14, left: 32, right: 32, fontSize: 8, color: "#9a9c9f", textAlign: "center" },
});

type FulfillmentInvoiceCurrency = "rub" | "cny";

const CURRENCY_LABEL: Record<FulfillmentInvoiceCurrency, string> = { rub: "₽", cny: "¥" };

function fmt(value: number, currency: FulfillmentInvoiceCurrency): string {
  if (!Number.isFinite(value)) return "—";
  return currency === "cny" ? value.toFixed(2) : Math.round(value).toLocaleString("ru-RU");
}

interface FulfillmentInvoiceLineItem {
  label: string;
  quantity: number;
  amount: number;
}

interface FulfillmentInvoicePdfProps {
  displayId: number;
  client: { name: string; company: string | null };
  currency: FulfillmentInvoiceCurrency;
  lineItems: FulfillmentInvoiceLineItem[];
  totalAmount: number;
}

function FulfillmentInvoicePdfDocument({ displayId, client, currency, lineItems, totalAmount }: FulfillmentInvoicePdfProps) {
  const currencySuffix = ` ${CURRENCY_LABEL[currency]}`;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Счёт на обработку — заявка №{displayId}</Text>
            <Text style={styles.subLine}>
              {client.name}
              {client.company ? ` · ${client.company}` : ""}
            </Text>
          </View>
          <Text style={styles.meta}>{new Date().toLocaleDateString("ru-RU")}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.headRow}>
            <Text style={styles.headCellLabel}>Товар</Text>
            <Text style={styles.headCellQty}>Кол-во</Text>
            <Text style={styles.headCellAmount}>Сумма{currencySuffix}</Text>
          </View>
          {lineItems.map((item, index) => (
            <View key={index} style={styles.bodyRow}>
              <Text style={styles.cellLabel}>{item.label}</Text>
              <Text style={styles.cellQty}>{item.quantity} шт.</Text>
              <Text style={styles.cellAmount}>
                {fmt(item.amount, currency)}
                {currencySuffix}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>ИТОГО К ОПЛАТЕ</Text>
          <Text style={styles.totalsValue}>
            {fmt(totalAmount, currency)}
            {currencySuffix}
          </Text>
        </View>

        <Text style={styles.footer} fixed>
          Panda Bridge — экосистема для бизнеса с Китаем.
        </Text>
      </Page>
    </Document>
  );
}

async function renderFulfillmentInvoicePdf(props: FulfillmentInvoicePdfProps): Promise<Buffer> {
  await ensureFontsRegistered();
  return renderToBuffer(<FulfillmentInvoicePdfDocument {...props} />);
}

export { renderFulfillmentInvoicePdf };
export type { FulfillmentInvoiceLineItem, FulfillmentInvoiceCurrency, FulfillmentInvoicePdfProps };
