import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { Document, Page, View, Text, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";

// Same font as lib/desk-services/quotes-list-pdf.tsx — see that file's
// comment for why it must be the full, unsplit Roboto file.
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
  colClient: { width: 100, paddingRight: 8 },
  colName: { flex: 1, paddingRight: 8 },
  colAmount: { width: 72, textAlign: "right" },
  colTotal: { width: 85, textAlign: "right" },
  totalCellValue: { fontWeight: 700, maxLines: 1, textOverflow: "ellipsis" },
  totalsRow: { flexDirection: "row", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#23252b", justifyContent: "flex-end", alignItems: "center", gap: 12 },
  totalsLabel: { fontSize: 11, fontWeight: 700 },
  totalsValue: { fontSize: 16, fontWeight: 700, color: "#2454cc" },
  note: { marginTop: 14, fontSize: 8, color: "#9a9c9f" },
  footer: { position: "absolute", bottom: 10, left: 28, right: 28, fontSize: 8, color: "#9a9c9f", textAlign: "center" },
});

type BuyoutInvoiceListCurrency = "rub" | "usd" | "usdt";

const CURRENCY_LABEL: Record<BuyoutInvoiceListCurrency, string> = { rub: "₽", usd: "$", usdt: "USDT" };

function fmt(value: number, currency: BuyoutInvoiceListCurrency): string {
  if (!Number.isFinite(value)) return "—";
  if (currency === "usdt") return value.toFixed(2);
  return Math.round(value).toLocaleString("ru-RU");
}

interface BuyoutInvoiceListRow {
  displayId: number;
  productName: string;
  clientName: string;
  clientCompany: string | null;
  totalPriceAmount: number;
  chinaDeliveryAmount: number;
  searchServiceAmount: number;
  customProductionAmount: number;
  buyoutCommissionAmount: number;
  attachedServicesAmount: number;
  totalAmount: number;
}

interface BuyoutInvoiceListPdfProps {
  // null when the list spans more than one client ("Все просчёты") — the
  // per-row Клиент column is shown instead of one shared header line.
  client: { name: string; company: string | null } | null;
  rows: BuyoutInvoiceListRow[];
  currency: BuyoutInvoiceListCurrency;
}

function BuyoutInvoiceListPdfDocument({ client, rows, currency }: BuyoutInvoiceListPdfProps) {
  const currencySuffix = ` ${CURRENCY_LABEL[currency]}`;
  const grandTotal = rows.reduce((sum, row) => sum + row.totalAmount, 0);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>
              Счета на выкуп — списком{client ? ` — ${client.name}${client.company ? ` · ${client.company}` : ""}` : ""}
            </Text>
            <Text style={styles.clientLine}>Всего просчётов: {rows.length}</Text>
          </View>
          <Text style={styles.meta}>{new Date().toLocaleDateString("ru-RU")}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.headRow}>
            <Text style={[styles.headCell, styles.colNum]}>№</Text>
            {!client && <Text style={[styles.headCell, styles.colClient]}>Клиент</Text>}
            <Text style={[styles.headCell, styles.colName]}>Товар</Text>
            <Text style={[styles.headCell, styles.colAmount]}>Товар{currencySuffix}</Text>
            <Text style={[styles.headCell, styles.colAmount]}>Китай{currencySuffix}</Text>
            <Text style={[styles.headCell, styles.colAmount]}>Поиск{currencySuffix}</Text>
            <Text style={[styles.headCell, styles.colAmount]}>Произв-во{currencySuffix}</Text>
            <Text style={[styles.headCell, styles.colAmount]}>Комиссия{currencySuffix}</Text>
            <Text style={[styles.headCell, styles.colAmount]}>Услуги{currencySuffix}</Text>
            <Text style={[styles.headCell, styles.colTotal]}>Итого{currencySuffix}</Text>
          </View>

          {rows.map((row) => (
            <View key={row.displayId} style={styles.bodyRow}>
              <Text style={[styles.cell, styles.cellText, styles.colNum]}>{row.displayId}</Text>
              {!client && (
                <Text style={[styles.cell, styles.cellText, styles.colClient]}>
                  {row.clientName}
                  {row.clientCompany ? ` · ${row.clientCompany}` : ""}
                </Text>
              )}
              <Text style={[styles.cell, styles.cellText, styles.colName]}>{row.productName}</Text>
              <Text style={[styles.cell, styles.cellText, styles.colAmount]}>{fmt(row.totalPriceAmount, currency)}</Text>
              <Text style={[styles.cell, styles.cellText, styles.colAmount]}>{fmt(row.chinaDeliveryAmount, currency)}</Text>
              <Text style={[styles.cell, styles.cellText, styles.colAmount]}>{fmt(row.searchServiceAmount, currency)}</Text>
              <Text style={[styles.cell, styles.cellText, styles.colAmount]}>
                {row.customProductionAmount > 0 ? fmt(row.customProductionAmount, currency) : "—"}
              </Text>
              <Text style={[styles.cell, styles.cellText, styles.colAmount]}>{fmt(row.buyoutCommissionAmount, currency)}</Text>
              <Text style={[styles.cell, styles.cellText, styles.colAmount]}>
                {row.attachedServicesAmount > 0 ? fmt(row.attachedServicesAmount, currency) : "—"}
              </Text>
              <Text style={[styles.cell, styles.totalCellValue, styles.colTotal]}>{fmt(row.totalAmount, currency)}{currencySuffix}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>ИТОГО ПО ВСЕМ СЧЕТАМ</Text>
          <Text style={styles.totalsValue}>{fmt(grandTotal, currency)}{currencySuffix}</Text>
        </View>

        {currency !== "rub" && (
          <Text style={styles.note}>
            {currency === "usd"
              ? "Суммы в $ пересчитаны по курсу доллара, зафиксированному в каждом просчёте на момент его расчёта — курс может отличаться между просчётами."
              : "Суммы в USDT пересчитаны по курсу юаня, зафиксированному в каждом просчёте, и текущему курсу USDT — курс ¥ может отличаться между просчётами."}
          </Text>
        )}

        <Text style={styles.footer} fixed>
          Panda Bridge — экосистема для бизнеса с Китаем.
        </Text>
      </Page>
    </Document>
  );
}

async function renderBuyoutInvoiceListPdf(props: BuyoutInvoiceListPdfProps): Promise<Buffer> {
  await ensureFontsRegistered();
  return renderToBuffer(<BuyoutInvoiceListPdfDocument {...props} />);
}

export { renderBuyoutInvoiceListPdf };
export type { BuyoutInvoiceListRow, BuyoutInvoiceListCurrency, BuyoutInvoiceListPdfProps };
