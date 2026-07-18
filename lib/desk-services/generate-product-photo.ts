import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import type { PhotoBrief } from "@/lib/desk-services/product-card-schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1440;
// Closest native gpt-image-1 size to the 1080x1440 (3:4) target — cropped to
// the exact target with sharp afterwards.
const GENERATION_SIZE = "1024x1536";

// Logo is composited deterministically with sharp (not drawn by the image
// model) — guarantees byte-identical position/size on every single slide,
// which the design system explicitly requires ("Never move logo. Never
// resize logo significantly. Always same spacing."). logo-badge.png is a
// pre-processed dark-mode-safe cutout of public/images/logo.png (white
// background removed via flood fill, black "PANDA" wordmark recolored to
// white so it reads on a dark card) — see the one-time conversion notes in
// this file's git history if it ever needs regenerating from a new logo.
const LOGO_MARGIN = 56;
const LOGO_HEIGHT = 92;

// Shared premium design system — identical on every slide, every product.
// Modeled on Apple/DJI/Anker/Baseus-style premium marketplace infographics
// per the approved spec: near-black background, exactly two accent colors,
// glassmorphism cards, thin-line icons, strict typography, no clipart.
const DESIGN_SYSTEM = `DESIGN SYSTEM (apply identically on every slide — consistency matters more than creativity):
- Premium dark theme. Background almost black (#050608) with soft volumetric blue and purple lighting,
  minimal particles, no noisy textures.
- Only these accent colors besides the product itself: #3478FF (blue), #7B3DFF (purple), white, light gray.
  No other colors, no rainbow gradients, no clipart, no childish/emoji icons, no stock-photo look.
- The product is always the hero: realistic, ultra-detailed, commercial product photography, luxury
  lighting, sharp reflections, natural soft shadows, centered/balanced composition, no distortions, no
  duplicated elements, no artifacts. Product occupies roughly 35-55% of the frame.
- Typography: large bold uppercase white headline (left-aligned), secondary line in a blue-to-purple
  gradient, never more than two font weights, generous spacing, clean sans-serif. Keep headline to 3-5
  words. Body/label text short, modern, minimal — never overload a slide with text.
- Information blocks: rounded corners (24-32px radius), dark glass background (glassmorphism), thin blue
  border, soft purple glow, subtle inner shadow — never a plain flat rectangle.
- Icons: minimal thin-line icons only, white/blue/purple, rounded, modern interface style — no emoji, no
  cartoon icons.
- STRICT SAFE-MARGIN RULE — identical on every single slide, no exceptions:
  · TOP: treat the top 20% of the canvas height (0 to y≈${Math.round(TARGET_HEIGHT * 0.2)}px) like a fixed
    app header bar or letterbox band that is physically part of the canvas frame, not empty space you could
    optionally fill — it belongs to the template, not to your composition. It must contain ONLY a
    continuation of the background — no product, no photo, no headline, no body text, no icons, no cards, no
    composition of any kind. NEVER draw a logo, circular emblem, wordmark, or brand name anywhere in the
    image, in this zone or elsewhere — a real logo is composited into this exact zone automatically after
    you generate the image; drawing your own will visibly collide or duplicate with it. This is the single
    most common mistake — many drafts fail by starting the headline right at the top edge of the canvas out
    of habit; deliberately push the headline down so its topmost pixel is no higher than 30% of the canvas
    height, comfortably in the upper-middle of the frame, never touching the top band.
  · SIDES: the left 10% and right 10% of the canvas width are reserved the same way — background
    continuation only, nothing cropped or bleeding into them, no text, no product, no cards.
  · BOTTOM: the bottom 10% of the canvas height is reserved the same way — background continuation only.
  · Keep every piece of actual content (headline, product, feature cards, tables, everything) fully inside
    the remaining safe zone in the middle of the canvas, with clear breathing room from all four edges.
- Never invent, add, or alter any text, numbers, model codes, or branding printed ON the product itself —
  reproduce exactly what is visible in the reference photo (or omit/blur it from view), never invent a
  model number, article code, or any digits that were not explicitly given to you. If the product has its
  own screen or display, copy its exact reading from the reference photo or show it blank/off — never
  invent new numbers or icons on it.
- Overall reference feel: Apple keynote, Tesla product page, DJI/Anker/Baseus premium campaigns — expensive,
  never cheap marketplace style.`;

async function loadLogoBadge(): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "public/images/logo-badge.png"));
}

// Prompt instructions alone were proven unreliable across three separate
// live tests — gpt-image-1 keeps drawing the main headline starting right at
// the very top of the canvas regardless of how the "reserve the top 20%"
// rule is worded, directly colliding with the composited logo. A soft
// semi-transparent scrim (the previous approach) only dimmed that text
// without fully hiding it — still visibly collided. This is now a
// near-opaque block: solid for the first 80% of the reserved zone (which
// covers every headline collision observed so far), fading out only in the
// last 20% so it blends into the AI-drawn background rather than ending in
// a hard visible line. Guarantees the safe-margin rule at the pixel level
// instead of hoping the model complies — the tradeoff is that a headline the
// model insists on drawing in this zone gets fully covered, not just dimmed.
const SCRIM_HEIGHT = Math.round(TARGET_HEIGHT * 0.2);

function buildTopScrimSvg(): Buffer {
  const svg = `<svg width="${TARGET_WIDTH}" height="${SCRIM_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#050608" stop-opacity="1"/>
        <stop offset="80%" stop-color="#050608" stop-opacity="1"/>
        <stop offset="100%" stop-color="#050608" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${TARGET_WIDTH}" height="${SCRIM_HEIGHT}" fill="url(#scrim)"/>
  </svg>`;
  return Buffer.from(svg);
}

async function compositeLogoAndCrop(imageBase64: string): Promise<Buffer> {
  const logoBuffer = await loadLogoBadge();
  const resizedLogo = await sharp(logoBuffer).resize({ height: LOGO_HEIGHT }).toBuffer();

  const generated = sharp(Buffer.from(imageBase64, "base64")).resize(TARGET_WIDTH, TARGET_HEIGHT, {
    fit: "cover",
    position: "centre",
  });

  return generated
    .composite([
      { input: buildTopScrimSvg(), left: 0, top: 0 },
      { input: resizedLogo, left: LOGO_MARGIN, top: LOGO_MARGIN },
    ])
    .png()
    .toBuffer();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === 429;
}

// Uses images.edit with the manager's product photo as the reference image
// (so the real product — shape/color/material — stays consistent across all
// slides instead of gpt-image-1 inventing a similar-looking but different item).
// The org's gpt-image-1 tier is rate-limited to a handful of images/minute —
// route.ts already batches calls to stay under that, but a slide can still
// occasionally land right on the edge of the window, so one longer wait-and-
// retry here catches that case instead of just dropping the slide.
async function generateProductPhoto(
  productPhotoBuffer: Buffer,
  productPhotoMimeType: string,
  productTitle: string,
  brief: PhotoBrief,
  index: number,
  retrying = false,
): Promise<Buffer | null> {
  const prompt = `Design one slide of a premium 5-slide product presentation for a marketplace listing (in
the style of a senior product designer for Wildberries/Ozon/Amazon premium brands).

${DESIGN_SYSTEM}

Product (from the reference image): ${productTitle}. Keep its real appearance — shape, color, material,
proportions, and any text/numbers/branding printed on it — exactly as shown; only change the scene/
background/composition/text around it. Do not invent a model number or any text on the product that isn't
visible in the reference photo.

THIS SPECIFIC SLIDE:
Theme: ${brief.purpose}.
Composition — what to show and how to lay it out: ${brief.composition}.
Text on the slide (Cyrillic, exact wording, short phrases only, no more than a few words per line —
double-check every word for typos before placing it): ${brief.textOverlay || "no additional text"}.
Extra notes for this slide: ${brief.notes}.`;

  try {
    const productExtension = productPhotoMimeType.split("/")[1] ?? "png";
    const productFile = await toFile(productPhotoBuffer, `product.${productExtension}`, { type: productPhotoMimeType });

    const response = await openai.images.edit({
      model: "gpt-image-1",
      image: [productFile],
      prompt,
      size: GENERATION_SIZE,
      quality: "high",
    });
    const base64 = response.data?.[0]?.b64_json;
    if (!base64) return null;

    return await compositeLogoAndCrop(base64);
  } catch (error) {
    if (isRateLimitError(error) && !retrying) {
      console.error(`Desk generate-product-card: slide ${index + 1} rate-limited, retrying in 15s`);
      await sleep(15_000);
      return generateProductPhoto(productPhotoBuffer, productPhotoMimeType, productTitle, brief, index, true);
    }
    console.error(`Desk generate-product-card: slide ${index + 1} generation failed`, error);
    return null;
  }
}

// Slide 5 — the fixed "universal company slide": same copy on every single
// export regardless of product, per the design spec ("This slide NEVER
// changes... works as branding for every product"). Only the product photo
// changes; the message about Panda Bridge itself is written once here
// rather than left to the model to reinvent (and possibly overclaim) each time.
// Deliberately NOT a 1:1 recreation of the richest reference layouts a
// manager might paste in (specs table + testimonials + package contents +
// warranty/return/24-7 badges all on one slide) — two independent reasons:
// 1) Trust: fabricated customer names/quotes are fake social proof, and a
//    warranty/return/support-hours row needs real confirmed policy numbers
//    (the site already had to walk back an unqualified "24/7 поддержка"
//    claim once — see project_pb_integrity_findings memory — a marketplace
//    listing is higher-stakes than a website page, it's literal sales copy
//    shown to real buyers). Add that row once real numbers exist.
// 2) Quality: that much content in one gpt-image-1 shot reliably produces a
//    sparser, worse result than a focused slide — the whole reason slide
//    count was cut from 10 to 5 was that denser briefs were coming out empty.
const COMPANY_SLIDE_BRIEF: PhotoBrief = {
  purpose: "Фирменный слайд Panda Bridge",
  composition:
    "Товар крупно слева или по центру на фирменной тёмной сцене. Справа — 4 карточки-значения в столбик " +
    "(закруглённый стеклянный блок на каждую, цветной кружок с тонкой иконкой + короткое слово заглавными " +
    "буквами + пояснение под ним, как на карточках-фичах Hero-слайда). Ниже — компактный блок с маскотом-пандой " +
    "и акцентом на контроль качества, и список этапов работы Panda Bridge со значками. Внизу — короткий призыв " +
    "к действию. Логотип и общий стиль — как на остальных карточках серии.",
  textOverlay: `PANDA BRIDGE
Ваш надёжный партнёр в Китае
НАДЁЖНОСТЬ
В каждой детали
СКОРОСТЬ
Без задержек на каждом этапе
ПРОЗРАЧНОСТЬ
Отчёт на каждом шаге сделки
ПОДДЕРЖКА
Всегда на связи
Контроль качества на каждом этапе производства
Поиск товара и поставщиков
Логистика и таможня под ключ
Склад и фулфилмент в Китае
Свяжитесь с нами — начнём работу над вашим товаром`,
  notes:
    "Это фирменный слайд — текст и оформление не зависят от конкретного товара, меняется только сам товар на " +
    "фото. Не добавляй цифры гарантий, сроков возврата, часов поддержки или клиентских отзывов/цитат — таких " +
    "подтверждённых данных нет, ничего не выдумывай.",
};

export { generateProductPhoto, COMPANY_SLIDE_BRIEF, TARGET_WIDTH, TARGET_HEIGHT };
