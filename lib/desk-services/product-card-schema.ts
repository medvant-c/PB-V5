import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { coerceToString, normalizeStringArray } from "@/lib/desk-services/schema";

// Output of the "Карточки товара" tool: no photo generation (Claude can't
// generate images) — a structured creative brief per photo a designer/
// photographer can execute, plus the selling + SEO description text, which
// Claude *can* produce directly from the product photo + spec screenshot.

interface PhotoBrief {
  purpose: string; // e.g. "Главное фото", "Инфографика: ключевые преимущества"
  composition: string; // framing, background, angle
  textOverlay: string; // what text/callouts belong on the image, if any
  notes: string; // best-practice notes specific to this shot
}

interface ProductCardPayload {
  productTitle?: string; // Claude reliably omits this too (see schema.ts) — caller falls back to user input
  sellingDescription: string;
  sellingBullets: string[];
  seoDescription: string;
  seoKeywords: string[];
  photoBriefs: PhotoBrief[];
  generalNotes: string;
}

const PRODUCT_CARD_TOOL_NAME = "present_product_card";

const photoBriefSchema = {
  type: "object",
  properties: {
    purpose: { type: "string", description: "Роль фото в карточке, например 'Главное фото' или 'Инфографика: преимущества'." },
    composition: { type: "string", description: "Композиция: план, фон, ракурс, что в кадре." },
    textOverlay: { type: "string", description: "Текст/акценты на фото, если уместны для этого типа кадра. Если текста быть не должно (например на главном фото) — так и написать." },
    notes: { type: "string", description: "Конкретный совет по этому кадру, основанный на практике маркетплейсов." },
  },
  required: ["purpose", "composition", "textOverlay", "notes"],
};

function buildProductCardTool(): Anthropic.Tool {
  return {
    name: PRODUCT_CARD_TOOL_NAME,
    description: "Показать бриф на карточку товара для маркетплейса: тексты и брифы на 5 слайдов премиальной презентации.",
    input_schema: {
      type: "object",
      properties: {
        productTitle: { type: "string", description: "Короткое название товара по фото/характеристикам." },
        sellingDescription: {
          type: "string",
          description: "Продающее описание товара для карточки — 2-4 коротких абзаца, через двойной перенос строки. Выгоды, а не только характеристики.",
        },
        sellingBullets: {
          type: "array",
          items: { type: "string" },
          description: "4-6 коротких пунктов ключевых преимуществ для блока буллетов в карточке.",
        },
        seoDescription: {
          type: "string",
          description: "Индексирующее описание для поиска маркетплейса — насыщено релевантными запросами естественно, без переспама.",
        },
        seoKeywords: {
          type: "array",
          items: { type: "string" },
          description: "8-15 поисковых фраз/ключевых слов для названия и описания карточки.",
        },
        photoBriefs: {
          type: "array",
          items: photoBriefSchema,
          description: "Ровно 4 брифа на слайды презентации, в порядке показа (5-й фирменный слайд добавляется отдельно, не входит сюда).",
        },
        generalNotes: {
          type: "string",
          description: "Короткая сквозная рекомендация по карточке в целом (стиль, единообразие, на что обратить внимание).",
        },
      },
      required: ["sellingDescription", "sellingBullets", "seoDescription", "seoKeywords", "photoBriefs", "generalNotes"],
    },
  };
}

function normalizePhotoBrief(value: unknown): PhotoBrief | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const purpose = coerceToString(v.purpose);
  const composition = coerceToString(v.composition);
  const textOverlay = coerceToString(v.textOverlay);
  const notes = coerceToString(v.notes);
  if (purpose === null || composition === null || textOverlay === null || notes === null) return null;
  return { purpose, composition, textOverlay, notes };
}

function normalizeProductCardPayload(value: unknown): ProductCardPayload | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;

  const productTitle = coerceToString(v.productTitle) ?? undefined;
  const sellingDescription = coerceToString(v.sellingDescription);
  const sellingBullets = normalizeStringArray(v.sellingBullets);
  const seoDescription = coerceToString(v.seoDescription);
  const seoKeywords = normalizeStringArray(v.seoKeywords);
  const generalNotes = coerceToString(v.generalNotes);

  if (
    !sellingDescription ||
    !sellingBullets ||
    !seoDescription ||
    !seoKeywords ||
    !generalNotes ||
    !Array.isArray(v.photoBriefs)
  ) {
    return null;
  }

  const photoBriefs: PhotoBrief[] = [];
  for (const raw of v.photoBriefs) {
    const brief = normalizePhotoBrief(raw);
    if (!brief) return null;
    photoBriefs.push(brief);
  }
  if (photoBriefs.length === 0) return null;

  return { productTitle, sellingDescription, sellingBullets, seoDescription, seoKeywords, photoBriefs, generalNotes };
}

export { PRODUCT_CARD_TOOL_NAME, buildProductCardTool, normalizeProductCardPayload };
export type { ProductCardPayload, PhotoBrief };
