import "server-only";
import type { Paragraph, Table } from "docx";
import { body, buildDocxBuffer, bulletList, coverPage, heading, note, spacer } from "@/lib/desk-services/docx-helpers";
import type { ProductCardPayload } from "@/lib/desk-services/product-card-schema";

interface ResolvedProductCardPayload extends ProductCardPayload {
  productTitle: string;
}

async function renderProductCardBrief(payload: ResolvedProductCardPayload): Promise<Buffer> {
  const tocItems = [
    "Продающее описание",
    "SEO / индексирующее описание",
    ...payload.photoBriefs.map((_, i) => `Слайд ${i + 1}`),
    "Общие рекомендации",
  ];

  const children: (Paragraph | Table)[] = [
    ...coverPage("Карточки товара", payload.productTitle, "Бриф на карточки + продающее и SEO-описание", tocItems),
    heading("Продающее описание"),
    ...payload.sellingDescription.split("\n\n").map((paragraph) => body(paragraph)),
    spacer(),
    ...bulletList(payload.sellingBullets),
    heading("SEO / индексирующее описание"),
    body(payload.seoDescription),
    spacer(),
    note(`Ключевые слова: ${payload.seoKeywords.join(", ")}`),
  ];

  payload.photoBriefs.forEach((brief, i) => {
    children.push(heading(`Слайд ${i + 1} — ${brief.purpose}`));
    children.push(body(`Композиция: ${brief.composition}`));
    children.push(body("Текст на карточке:"));
    brief.textOverlay
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => children.push(body(line)));
    children.push(note(brief.notes));
  });

  children.push(heading("Общие рекомендации"));
  children.push(body(payload.generalNotes));

  return buildDocxBuffer(children);
}

export { renderProductCardBrief };
