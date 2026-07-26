// Shared client-facing disclaimer text — the manager's exact wording,
// structured so both PDF renderers (paragraph-by-paragraph Text blocks) and
// the Excel export (one flattened cell) can reuse the same source of
// truth instead of three copies of the same long Russian text drifting
// apart over time.
type DisclaimerBlock = { type: "paragraph"; text: string } | { type: "bullets"; items: string[] };

const QUOTE_DISCLAIMER_TITLE = "⚠️ ВНИМАНИЕ!";

const QUOTE_DISCLAIMER_BLOCKS: DisclaimerBlock[] = [
  { type: "paragraph", text: "Расчёт носит предварительный ознакомительный характер." },
  {
    type: "paragraph",
    text: "Все указанные данные по стоимости, весу, габаритам и логистике рассчитаны на основании информации, предоставленной продавцом или фабрикой на момент подготовки расчёта.",
  },
  { type: "paragraph", text: "📦 Вес и размеры товара являются предварительными." },
  { type: "paragraph", text: "Фактический вес, объём и габариты могут измениться после:" },
  {
    type: "bullets",
    items: ["поступления товара на склад", "проверки товара", "упаковки и подготовки к отправке"],
  },
  {
    type: "paragraph",
    text: "Окончательная стоимость доставки будет определена после фактического измерения товара на складе.",
  },
  {
    type: "paragraph",
    text: "💱 Валютные расчёты произведены по курсу юаня и доллара на дату формирования расчёта.",
  },
  {
    type: "paragraph",
    text: "В процессе закупки, производства и доставки курс валют может измениться как в большую, так и в меньшую сторону.",
  },
  {
    type: "paragraph",
    text: "В связи с этим итоговая стоимость может корректироваться в зависимости от актуального курса валют на момент оплаты и отправки товара.",
  },
];

function quoteDisclaimerPlainText(): string {
  const lines = [QUOTE_DISCLAIMER_TITLE, ""];
  for (const block of QUOTE_DISCLAIMER_BLOCKS) {
    if (block.type === "paragraph") lines.push(block.text);
    else lines.push(...block.items.map((item) => `• ${item}`));
  }
  return lines.join("\n");
}

// No text font embeds color-emoji glyphs (⚠️/📦/💱 here), and PDF text
// rendering can't display color-emoji fonts even if one were embedded —
// react-pdf/pdfkit silently mangles the missing codepoints into garbage
// glyphs instead of just skipping them (same class of bug as an earlier ₽
// rendering issue in this codebase). Strip emoji only for PDF output;
// Excel/plain-text consumers render emoji fine via the OS's own font, so
// they use the unstripped strings above directly.
function stripEmojiForPdf(text: string): string {
  return text.replace(/\p{Extended_Pictographic}️?/gu, "").trim();
}

export { QUOTE_DISCLAIMER_TITLE, QUOTE_DISCLAIMER_BLOCKS, quoteDisclaimerPlainText, stripEmojiForPdf };
export type { DisclaimerBlock };
