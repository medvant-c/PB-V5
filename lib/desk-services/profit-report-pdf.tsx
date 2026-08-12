import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { Document, Page, View, Text, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";

// Same font as lib/desk-services/quote-pdf.tsx — see that file's comment for
// why it must be the full, unsplit Roboto file (₽ coverage).
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

// Same palette as quotes-list-pdf.tsx.
const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: "Roboto", fontSize: 9.5, color: "#23252b" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  title: { fontSize: 16, fontWeight: 700 },
  subLine: { fontSize: 9.5, color: "#63666f", marginTop: 2 },
  meta: { fontSize: 9, color: "#9a9c9f", textAlign: "right" },
  confidential: { fontSize: 8, color: "#c47f0a", textAlign: "right", marginTop: 2 },
  table: { borderTopWidth: 1, borderTopColor: "#23252b" },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#23252b", paddingVertical: 6 },
  headCell: { fontSize: 8, fontWeight: 700, color: "#63666f", textTransform: "uppercase", maxLines: 1 },
  bodyRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: 0.5, borderBottomColor: "#e1dfd7", paddingVertical: 5 },
  cell: { justifyContent: "center" },
  cellText: { maxLines: 1, textOverflow: "ellipsis" },
  colNum: { width: 24 },
  colClient: { width: 110, paddingRight: 6 },
  colProduct: { flex: 1, paddingRight: 8 },
  colManager: { width: 90, paddingRight: 6 },
  colStatus: { width: 56 },
  colTotal: { width: 76, textAlign: "right" },
  colProfit: { width: 76, textAlign: "right" },
  statusFact: { fontSize: 7.5, fontWeight: 700, color: "#1f9d55" },
  statusEstimate: { fontSize: 7.5, fontWeight: 700, color: "#c47f0a" },
  profitPositive: { fontWeight: 700, color: "#1f9d55" },
  profitNegative: { fontWeight: 700, color: "#d64545" },
  summaryBox: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#23252b" },
  summaryTitle: { fontSize: 11, fontWeight: 700, marginBottom: 8 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  summaryLabel: { fontSize: 9.5, color: "#63666f" },
  summaryValue: { fontSize: 9.5, fontWeight: 700 },
  summaryTotalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#e1dfd7" },
  summaryTotalLabel: { fontSize: 11, fontWeight: 700 },
  summaryTotalValue: { fontSize: 16, fontWeight: 700, color: "#2454cc" },
  splitBox: { marginTop: 12, padding: 10, backgroundColor: "#f4f5f8", borderRadius: 6 },
  splitTitle: { fontSize: 9.5, fontWeight: 700, marginBottom: 6, color: "#23252b" },
  splitRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  splitLabel: { fontSize: 9, color: "#63666f" },
  splitValue: { fontSize: 9, fontWeight: 700 },
  footer: { position: "absolute", bottom: 10, left: 28, right: 28, fontSize: 8, color: "#9a9c9f", textAlign: "center" },
});

function fmt(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

interface ProfitReportPdfRow {
  displayId: number;
  productName: string;
  totalRub: number;
  totalProfitRub: number;
  buyout: { incomeRub: number; expenseRub: number; profitRub: number; realized: boolean };
  cargo: { incomeRub: number; expenseRub: number; profitRub: number; realized: boolean };
  client: { name: string; company: string | null };
  manager: { name: string };
}

interface ProfitReportPdfTotals {
  totalRevenueRub: number;
  totalProfitRub: number;
  totalBuyoutIncomeRub: number;
  totalBuyoutExpenseRub: number;
  totalBuyoutProfitRub: number;
  totalCargoIncomeRub: number;
  totalCargoExpenseRub: number;
  totalCargoProfitRub: number;
  profitPoolRub: number;
  managerPremiumRub: number;
  investorShares: { id: string; name: string; shareType: string; shareRub: number }[];
}

interface ProfitReportPdfProps {
  rows: ProfitReportPdfRow[];
  totals: ProfitReportPdfTotals;
}

function ProfitReportPdfDocument({ rows, totals }: ProfitReportPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Отчёт о прибыли</Text>
            <Text style={styles.subLine}>Выбрано просчётов: {rows.length}</Text>
          </View>
          <View>
            <Text style={styles.meta}>{new Date().toLocaleDateString("ru-RU")}</Text>
            <Text style={styles.confidential}>Конфиденциально — только для руководителя</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.headRow}>
            <Text style={[styles.headCell, styles.colNum]}>№</Text>
            <Text style={[styles.headCell, styles.colClient]}>Клиент</Text>
            <Text style={[styles.headCell, styles.colProduct]}>Товар</Text>
            <Text style={[styles.headCell, styles.colManager]}>Менеджер</Text>
            <Text style={[styles.headCell, styles.colStatus]}>Статус</Text>
            <Text style={[styles.headCell, styles.colTotal]}>Клиент платит, ₽</Text>
            <Text style={[styles.headCell, styles.colProfit]}>Профит, ₽</Text>
          </View>

          {rows.map((row) => (
            <View key={row.displayId} style={styles.bodyRow}>
              <Text style={[styles.cell, styles.cellText, styles.colNum]}>{row.displayId}</Text>
              <Text style={[styles.cell, styles.cellText, styles.colClient]}>
                {row.client.name}
                {row.client.company ? ` · ${row.client.company}` : ""}
              </Text>
              <Text style={[styles.cell, styles.cellText, styles.colProduct]}>{row.productName}</Text>
              <Text style={[styles.cell, styles.cellText, styles.colManager]}>{row.manager.name}</Text>
              <View style={[styles.cell, styles.colStatus]}>
                <Text style={row.buyout.realized ? styles.statusFact : styles.statusEstimate}>
                  {row.buyout.realized ? "Факт" : "План"}
                </Text>
              </View>
              <Text style={[styles.cell, styles.cellText, styles.colTotal]}>{fmt(row.totalRub)}</Text>
              <Text style={[styles.cell, styles.cellText, styles.colProfit, row.totalProfitRub >= 0 ? styles.profitPositive : styles.profitNegative]}>
                {fmt(row.totalProfitRub)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>Итого по выбранным сделкам</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Клиенты заплатят (оборот)</Text>
            <Text style={styles.summaryValue}>{fmt(totals.totalRevenueRub)} ₽</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Прибыль компании (Выкуп + Карго)</Text>
            <Text style={styles.summaryValue}>{fmt(totals.totalProfitRub)} ₽</Text>
          </View>

          <View style={styles.splitBox}>
            <Text style={styles.splitTitle}>Выкуп</Text>
            <View style={styles.splitRow}>
              <Text style={styles.splitLabel}>Поступило</Text>
              <Text style={styles.splitValue}>{fmt(totals.totalBuyoutIncomeRub)} ₽</Text>
            </View>
            <View style={styles.splitRow}>
              <Text style={styles.splitLabel}>Потратили</Text>
              <Text style={styles.splitValue}>{fmt(totals.totalBuyoutExpenseRub)} ₽</Text>
            </View>
            <View style={styles.splitRow}>
              <Text style={styles.splitLabel}>Прибыль</Text>
              <Text style={styles.splitValue}>{fmt(totals.totalBuyoutProfitRub)} ₽</Text>
            </View>
          </View>

          <View style={styles.splitBox}>
            <Text style={styles.splitTitle}>Карго</Text>
            <View style={styles.splitRow}>
              <Text style={styles.splitLabel}>Поступило</Text>
              <Text style={styles.splitValue}>{fmt(totals.totalCargoIncomeRub)} ₽</Text>
            </View>
            <View style={styles.splitRow}>
              <Text style={styles.splitLabel}>Потратили</Text>
              <Text style={styles.splitValue}>{fmt(totals.totalCargoExpenseRub)} ₽</Text>
            </View>
            <View style={styles.splitRow}>
              <Text style={styles.splitLabel}>Прибыль</Text>
              <Text style={styles.splitValue}>{fmt(totals.totalCargoProfitRub)} ₽</Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Премии менеджеров (уже вычтены ниже)</Text>
            <Text style={styles.summaryValue}>{fmt(totals.managerPremiumRub)} ₽</Text>
          </View>
          <View style={styles.summaryTotalRow}>
            <Text style={styles.summaryTotalLabel}>ДОСТУПНО ДЛЯ РАСПРЕДЕЛЕНИЯ</Text>
            <Text style={styles.summaryTotalValue}>{fmt(totals.profitPoolRub - totals.managerPremiumRub)} ₽</Text>
          </View>

          <View style={styles.splitBox}>
            <Text style={styles.splitTitle}>Доля партнёров</Text>
            {totals.investorShares.map((inv) => (
              <View key={inv.id} style={styles.splitRow}>
                <Text style={styles.splitLabel}>{inv.name}</Text>
                <Text style={styles.splitValue}>{fmt(inv.shareRub)} ₽</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.footer} fixed>
          Panda Bridge — внутренний отчёт, не для передачи клиентам или сотрудникам.
        </Text>
      </Page>
    </Document>
  );
}

async function renderProfitReportPdf(props: ProfitReportPdfProps): Promise<Buffer> {
  await ensureFontsRegistered();
  return renderToBuffer(<ProfitReportPdfDocument {...props} />);
}

export { renderProfitReportPdf };
export type { ProfitReportPdfRow, ProfitReportPdfTotals };
