import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { Document, Page, View, Text, Image, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import { QUOTE_DISCLAIMER_TITLE, QUOTE_DISCLAIMER_BLOCKS, stripEmojiForPdf } from "@/lib/desk-services/quote-disclaimer";
import { SEARCH_TIER_INFO } from "@/lib/desk-services/search-tier-info";

// react-pdf's built-in fonts (Helvetica etc.) have no Cyrillic glyphs at
// all — without registering a real font here, every Russian character in
// this PDF would render as blank boxes. roboto-*.woff are local, git-tracked
// assets (public/fonts/) copied once from the "roboto-fontface" npm package.
//
// Must be the FULL, unsplit Roboto file, not one of @fontsource/roboto's
// per-unicode-range subsets: those are meant to be used together as a CSS
// font stack (the browser fetches only the range it needs), and the
// "cyrillic" subset alone excludes basic Latin digits and currency symbols
// ($, %, ¥, ₽). When @react-pdf/renderer hits a character missing from the
// registered font, it silently falls back to a built-in font whose encoding
// can't represent ₽ either, and that fallback path mangles it into "½"
// instead of failing loudly — so the previous cyrillic-only subset produced
// a PDF that looked fine for Cyrillic text but silently corrupted every
// price line. The full font's cmap covers Latin + Cyrillic + currency in
// one file, so no per-character fallback ever triggers.
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

// Design intent (Лебедев-style): the photo is the pitch, not decoration —
// it goes first, full width, before the client even reads the product
// name, because a buyer decides "выкупать или нет" on the image before the
// numbers. Everything else (client info, line items) stays small and quiet
// so it doesn't compete with the photo or the final price. No brand
// wordmark/logo anywhere — the manager asked for it gone; a plain-text
// footer credit is not a logo and stays.
const styles = StyleSheet.create({
  page: { padding: 32, fontFamily: "Roboto", fontSize: 10, color: "#23252b" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  meta: { fontSize: 9, color: "#9a9c9f" },
  // objectFit: "contain" (not "cover") — the manager's photo must show
  // exactly as uploaded, no cropped edges; backgroundColor fills the
  // letterboxing that appears when the photo's aspect ratio doesn't match
  // this fixed box, so it reads as "framed", not "broken".
  heroPhoto: { width: "100%", height: 260, borderRadius: 10, objectFit: "contain", backgroundColor: "#f4f5f8", marginBottom: 6 },
  thumbRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  thumbPhoto: { width: 84, height: 84, borderRadius: 8, objectFit: "contain", backgroundColor: "#f4f5f8" },
  title: { fontSize: 21, fontWeight: 700, marginBottom: 10, lineHeight: 1.15 },
  clientLine: { fontSize: 9.5, color: "#63666f", marginBottom: 14 },
  metaLine: { flexDirection: "row", gap: 18, marginBottom: 16 },
  metaLineItem: { fontSize: 9.5, color: "#63666f" },
  metaLineValue: { fontWeight: 700, color: "#23252b" },
  description: { fontSize: 9.5, color: "#63666f", marginBottom: 14, lineHeight: 1.4 },
  sectionTitle: { fontSize: 9.5, fontWeight: 700, marginBottom: 6, color: "#63666f", textTransform: "uppercase" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#e1dfd7" },
  rowLabel: { color: "#63666f", flex: 1, paddingRight: 10 },
  rowValue: { fontWeight: 700 },
  freeValue: { fontWeight: 700, color: "#1f9d55" },
  density: { fontWeight: 700, color: "#2454cc" },
  densityLow: { fontWeight: 700, color: "#c47f0a" },
  totalBox: {
    marginTop: 14,
    padding: 16,
    backgroundColor: "#2454cc",
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: { fontSize: 12, fontWeight: 700, color: "#ffffff" },
  totalValue: { fontSize: 22, fontWeight: 700, color: "#ffffff" },
  // "Под ключ" — the full total (goods + delivery + fees + commission)
  // spread evenly across quantity, not just the goods price per unit
  // (that's already shown separately in the "Товар" row above).
  perUnitNote: { marginTop: 6, fontSize: 9, color: "#63666f", textAlign: "right" },
  footer: { position: "absolute", bottom: 12, left: 32, right: 32, fontSize: 8, color: "#9a9c9f", textAlign: "center" },
  disclaimerBox: { marginTop: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#e1dfd7" },
  disclaimerTitle: { fontSize: 10.5, fontWeight: 700, marginBottom: 6, color: "#23252b" },
  disclaimerParagraph: { fontSize: 8, color: "#63666f", marginBottom: 3, lineHeight: 1.4 },
  disclaimerBullets: { marginBottom: 3, paddingLeft: 6 },
  // Explains what the client is actually paying the search-service fee
  // for — the client sees a price on the invoice above, this is "what you
  // get for it", not internal manager reference material.
  tierInfoBox: { marginTop: 14, padding: 10, backgroundColor: "#f4f5f8", borderRadius: 8 },
  tierInfoTitle: { fontSize: 9, fontWeight: 700, marginBottom: 4, color: "#23252b" },
  tierInfoIntro: { fontSize: 8, fontWeight: 700, color: "#63666f", marginBottom: 2 },
  tierInfoBullet: { fontSize: 8, color: "#63666f", marginBottom: 1.5, lineHeight: 1.3 },
});

function fmt(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

interface QuotePdfProps {
  quote: {
    displayId: number;
    productName: string;
    productDescription: string | null;
    color: string | null;
    dimensions: string | null;
    quantity: number;
    quoteType: string;
    priceCnyPerUnit: number;
    totalPriceCny: number;
    totalPriceRub: number;
    chinaDeliveryRub: number;
    totalWeightKg: number;
    totalVolumeM3: number;
    densityKgM3: number;
    cargoDeliveryUsd: number;
    cargoDeliveryRub: number;
    searchServiceFeeRub: number;
    searchFeeWaived: boolean;
    buyoutCommissionPercent: number;
    buyoutCommissionRub: number;
    totalRub: number;
    createdAt: Date | string;
  };
  client: { name: string; company: string | null; phone: string | null; messenger: string | null };
  photoBuffers: Buffer[];
  attachedServices: { name: string; priceRub: number }[];
}

const QUOTE_TYPE_LABEL: Record<string, string> = {
  standard: "Standard",
  expert: "Expert",
  pro: "Pro",
};

// Just the <Page> — extracted so a multi-quote bundle can render several of
// these as siblings under one <Document> (react-pdf's merge unit is the
// Page, not the Document), while a single-quote PDF still wraps exactly one.
function QuotePdfPage({ quote, client, photoBuffers, attachedServices }: QuotePdfProps) {
  const createdAt = new Date(quote.createdAt);
  const [heroPhoto, ...thumbPhotos] = photoBuffers;
  const tierInfo = SEARCH_TIER_INFO[quote.quoteType as keyof typeof SEARCH_TIER_INFO];

  return (
      <Page size="A4" style={styles.page}>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>Расчётный лист №{quote.displayId}</Text>
          <Text style={styles.meta}>{createdAt.toLocaleDateString("ru-RU")}</Text>
        </View>

        {heroPhoto && (
          // cache={false}: works around an intermittent corruption in react-pdf's internal
          // image LRU cache when identical image bytes are rendered more than once in a
          // process's lifetime — see the longer note in quotes-list-pdf.tsx.
          // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image is a PDF drawing primitive, not an HTML <img>; it has no alt prop
          <Image src={heroPhoto} style={styles.heroPhoto} cache={false} />
        )}
        {thumbPhotos.length > 0 && (
          <View style={styles.thumbRow}>
            {thumbPhotos.map((buffer, index) => (
              // eslint-disable-next-line jsx-a11y/alt-text -- see above
              <Image key={index} src={buffer} style={styles.thumbPhoto} cache={false} />
            ))}
          </View>
        )}

        <Text style={styles.title}>{quote.productName}</Text>

        <Text style={styles.clientLine}>
          {client.name}
          {client.company ? ` · ${client.company}` : ""}
          {client.phone ? ` · ${client.phone}` : ""}
          {client.messenger ? ` · ${client.messenger}` : ""}
        </Text>

        <View style={styles.metaLine}>
          <Text style={styles.metaLineItem}>
            Цвет: <Text style={styles.metaLineValue}>{quote.color ?? "—"}</Text>
          </Text>
          <Text style={styles.metaLineItem}>
            Габариты: <Text style={styles.metaLineValue}>{quote.dimensions ?? "—"}</Text>
          </Text>
          <Text style={styles.metaLineItem}>
            Количество: <Text style={styles.metaLineValue}>{quote.quantity} шт</Text>
          </Text>
        </View>

        {quote.productDescription && <Text style={styles.description}>{quote.productDescription}</Text>}

        <View>
          <Text style={styles.sectionTitle}>Расчёт стоимости</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>
              Товар ({quote.priceCnyPerUnit}¥ × {quote.quantity})
            </Text>
            <Text style={styles.rowValue}>
              {fmt(quote.totalPriceCny)}¥ / {fmt(quote.totalPriceRub)}₽
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Доставка по Китаю</Text>
            <Text style={styles.rowValue}>{fmt(quote.chinaDeliveryRub)}₽</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Услуга поиска товара ({QUOTE_TYPE_LABEL[quote.quoteType]})</Text>
            {quote.searchFeeWaived ? (
              <Text style={styles.freeValue}>БЕСПЛАТНО</Text>
            ) : (
              <Text style={styles.rowValue}>{fmt(quote.searchServiceFeeRub)}₽</Text>
            )}
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Организация выкупа ({quote.buyoutCommissionPercent}%)</Text>
            <Text style={styles.rowValue}>{fmt(quote.buyoutCommissionRub)}₽</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>
              Доставка карго ({quote.totalWeightKg.toFixed(1)} кг, {quote.totalVolumeM3.toFixed(3)} м³, плотность{" "}
              <Text style={quote.densityKgM3 < 100 ? styles.densityLow : styles.density}>
                {fmt(quote.densityKgM3)} кг/м³
              </Text>
              )
            </Text>
            <Text style={styles.rowValue}>
              {quote.cargoDeliveryUsd.toFixed(1)}$ / {fmt(quote.cargoDeliveryRub)}₽
            </Text>
          </View>
          {attachedServices.map((service, index) => (
            <View key={index} style={styles.row}>
              <Text style={styles.rowLabel}>{service.name}</Text>
              <Text style={styles.rowValue}>{fmt(service.priceRub)}₽</Text>
            </View>
          ))}

          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>ИТОГО К ОПЛАТЕ</Text>
            <Text style={styles.totalValue}>{fmt(quote.totalRub)} ₽</Text>
          </View>
          <Text style={styles.perUnitNote}>
            Цена за единицу под ключ: {fmt(quote.totalRub / quote.quantity)} ₽/шт
          </Text>
        </View>

        <View style={styles.tierInfoBox} wrap={false}>
          <Text style={styles.tierInfoTitle}>Что входит в услугу поиска товара «{tierInfo.label}»</Text>
          {tierInfo.intro && <Text style={styles.tierInfoIntro}>{tierInfo.intro}</Text>}
          {tierInfo.bullets.map((bullet, index) => (
            <Text key={index} style={styles.tierInfoBullet}>
              •  {bullet}
            </Text>
          ))}
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

        {/* fixed: repeats on every page, unlike the disclaimer above which
            flows normally and may push to page 2 on a long quote. */}
        <Text style={styles.footer} fixed>
          Panda Bridge — экосистема для бизнеса с Китаем.
        </Text>
      </Page>
  );
}

function QuotePdfDocument(props: QuotePdfProps) {
  return (
    <Document>
      <QuotePdfPage {...props} />
    </Document>
  );
}

// One Page per quote, in the given order — "выгрузить в один файл по
// порядку" (manager bulk export) and the client portal's own "скачать
// выбранные" both merge into a single PDF this way, instead of a zip of
// separate files.
function QuotesBundlePdfDocument({ quotes }: { quotes: QuotePdfProps[] }) {
  return (
    <Document>
      {quotes.map((props, index) => (
        <QuotePdfPage key={index} {...props} />
      ))}
    </Document>
  );
}

async function renderQuotePdf(props: QuotePdfProps): Promise<Buffer> {
  await ensureFontsRegistered();
  return renderToBuffer(<QuotePdfDocument {...props} />);
}

async function renderQuotesBundlePdf(quotes: QuotePdfProps[]): Promise<Buffer> {
  await ensureFontsRegistered();
  return renderToBuffer(<QuotesBundlePdfDocument quotes={quotes} />);
}

export { renderQuotePdf, renderQuotesBundlePdf };
export type { QuotePdfProps };
